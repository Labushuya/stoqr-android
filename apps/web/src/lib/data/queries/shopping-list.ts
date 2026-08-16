import { getDb } from '$data/db'
import { shoppingListItems } from '@stoqr/db'
import { and, eq, asc, desc } from 'drizzle-orm'
import { getStockTargets } from './stock-targets'
import { getProductStockTotals } from './products'
import { getUnits } from './households'
import { buildUnitMetaMap, compareToTarget, buildPackSize, resolveUnitMeta } from '$lib/utils/stock'

// ---------------------------------------------------------------------------
// Einkaufsliste (shopping_list_items). auto-Einträge = „virtuelle Bestände"
// aus dem Soll-Ist-Bedarf; manuelle Einträge frei per Freitext.
// ---------------------------------------------------------------------------

/**
 * Liefert die Einkaufsliste des Haushalts. Jedes Item wird um Reservierungs-Info
 * angereichert (`reservedTrip*`): ist der Bedarf einem Einkauf-Run zugewiesen,
 * zeigt die UI ihn „sichtbar aber gesperrt".
 */
export async function getShoppingList(householdId: string) {
  const db = getDb()
  const [items, reservations] = await Promise.all([
    db.query.shoppingListItems.findMany({
      where: (s, { eq }) => eq(s.householdId, householdId),
      orderBy: [asc(shoppingListItems.isChecked), desc(shoppingListItems.priority), asc(shoppingListItems.createdAt)],
      with: {
        product: { columns: { id: true, name: true } },
        preferredStore: { columns: { id: true, name: true } },
      },
    }),
    db.query.shoppingTripItems.findMany({
      where: (i, { eq }) => eq(i.householdId, householdId),
      columns: { id: true, shoppingListItemId: true, tripId: true, realStatus: true },
      with: { trip: { columns: { id: true, name: true, status: true, storeId: true } } },
    }),
  ])

  const byNeed = new Map<string, (typeof reservations)[number]>()
  for (const r of reservations) byNeed.set(r.shoppingListItemId, r)

  return items.map((it) => {
    const r = byNeed.get(it.id)
    return {
      ...it,
      reservedTripItemId: r?.id ?? null,
      reservedTripId: r?.trip?.id ?? null,
      reservedTripName: r?.trip?.name ?? null,
      reservedTripStatus: r?.trip?.status ?? null,
      reservedTripStoreId: r?.trip?.storeId ?? null,
    }
  })
}

export async function addManualItem(input: {
  householdId: string
  freeTextName: string
  quantity?: number | string
  unit?: string
  notes?: string | null
}) {
  const db = getDb()
  const [row] = await db
    .insert(shoppingListItems)
    .values({
      householdId: input.householdId,
      freeTextName: input.freeTextName,
      quantity: input.quantity != null ? String(input.quantity) : '1',
      unit: input.unit ?? 'piece',
      source: 'manual',
      notes: input.notes ?? null,
    })
    .returning()
  return row
}

export async function updateShoppingItem(
  id: string,
  householdId: string,
  data: Partial<{ isChecked: boolean; quantity: number | string; unit: string; notes: string | null }>
) {
  const db = getDb()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.isChecked !== undefined) {
    patch.isChecked = data.isChecked
    patch.checkedAt = data.isChecked ? new Date() : null
  }
  if (data.quantity !== undefined) patch.quantity = String(data.quantity)
  if (data.unit !== undefined) patch.unit = data.unit
  if (data.notes !== undefined) patch.notes = data.notes

  const [row] = await db
    .update(shoppingListItems)
    .set(patch)
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.householdId, householdId)))
    .returning()
  return row ?? null
}

export async function deleteShoppingItem(id: string, householdId: string) {
  const db = getDb()
  // Guard: ein einem Einkauf-Run reservierter Bedarf darf nicht direkt geloescht
  // werden (sonst verschwaende cascade die Trip-Position). Erst Reservierung loesen.
  const reserved = await db.query.shoppingTripItems.findFirst({
    where: (i, { and, eq }) => and(eq(i.shoppingListItemId, id), eq(i.householdId, householdId)),
    columns: { id: true },
  })
  if (reserved) return { deleted: false, reserved: true }

  const [row] = await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, id), eq(shoppingListItems.householdId, householdId)))
    .returning({ id: shoppingListItems.id })
  return { deleted: !!row, reserved: false }
}

/**
 * Erzeugt/aktualisiert auto-Bedarf-Einträge aus dem Soll-Ist-Vergleich.
 * EIN offener auto-Eintrag pro Artikel — unabhängig von der Markt-Zuordnung
 * (der Markt wird erst beim Zuweisen zu einem Einkauf-Run gewählt). Fehlmenge =
 * Soll − Ist (in Soll-Einheit). Gedeckte Artikel: offenen auto-Eintrag entfernen.
 * Reservierte (einem Run zugewiesene) auto-Einträge werden nie angefasst.
 * Bestehende markt-duplizierte auto-Einträge desselben Artikels werden auf einen
 * zusammengeführt (übrige als verwaist entfernt).
 */
export async function generateAutoNeeds(householdId: string): Promise<{ created: number; updated: number; removed: number }> {
  const db = getDb()
  const [targets, units] = await Promise.all([getStockTargets(householdId), getUnits(householdId)])
  const metaMap = buildUnitMetaMap(units)

  // Bestehende offene auto-Einträge (nicht abgehakt).
  const existing = await db.query.shoppingListItems.findMany({
    where: (s, { and, eq }) =>
      and(eq(s.householdId, householdId), eq(s.source, 'auto'), eq(s.isChecked, false)),
  })

  // Reservierte Bedarfe (einem Einkauf-Run zugewiesen) — geschützt: werden vom
  // Auto-Lauf weder aktualisiert noch gelöscht; der Artikel gilt als abgedeckt.
  const reservedRows = await db.query.shoppingTripItems.findMany({
    where: (i, { eq }) => eq(i.householdId, householdId),
    columns: { shoppingListItemId: true },
  })
  const reservedItemIds = new Set(reservedRows.map((r) => r.shoppingListItemId))

  // Nach productId gruppieren (ein Bedarf pro Artikel). Reservierte Artikel merken;
  // pro Artikel höchstens EINEN offenen Eintrag behalten, überzählige (alte Markt-
  // Duplikate) direkt als verwaist einsammeln.
  const openByProduct = new Map<string, (typeof existing)[number]>()
  const reservedProductIds = new Set<string>()
  const orphans: (typeof existing)[number][] = []
  for (const e of existing) {
    if (!e.productId) continue // Freitext-auto gibt es nicht; defensiv
    if (reservedItemIds.has(e.id)) {
      reservedProductIds.add(e.productId)
      continue
    }
    if (openByProduct.has(e.productId)) {
      orphans.push(e) // Duplikat desselben Artikels → wird entfernt
    } else {
      openByProduct.set(e.productId, e)
    }
  }

  const stillNeeded = new Set<string>() // productIds, die in diesem Lauf bestätigt werden

  let created = 0
  let updated = 0
  let removed = 0

  for (const t of targets) {
    const totals = await getProductStockTotals(t.productId, householdId)
    // Gebinde-Größe des Artikels (Einheiten v2) → konsistente Umrechnung wie in getProductStockTotals.
    const packSize = t.product ? buildPackSize(t.product) : undefined
    const cmp = compareToTarget(
      totals,
      { targetQuantity: t.targetQuantity, unit: t.unit, minQuantity: t.minQuantity },
      metaMap,
      packSize
    )

    // Kein sinnvoller Bedarf → offener auto-Eintrag dieses Artikels läuft aus.
    if (cmp.status === 'not_comparable' || cmp.status === 'ok') continue

    // Fehlmenge zurück in die Soll-Einheit — mit demselben (ggf. Gebinde-)Faktor.
    const factor = resolveUnitMeta(t.unit, metaMap, packSize).toBaseFactor
    const shortfallInBase = cmp.targetInBase - cmp.currentInBase
    const qty = shortfallInBase / (factor || 1)
    if (qty <= 0) continue

    stillNeeded.add(t.productId)
    // Bereits einem Run zugewiesen → nicht erneut als offenen Bedarf erzeugen.
    if (reservedProductIds.has(t.productId)) continue

    const open = openByProduct.get(t.productId)
    if (open) {
      // Vorhandenen Eintrag aktualisieren; Markt-Zuordnung entfernen (markt-neutral).
      await db
        .update(shoppingListItems)
        .set({ quantity: String(qty), unit: t.unit, preferredStoreId: null, updatedAt: new Date() })
        .where(eq(shoppingListItems.id, open.id))
      updated++
    } else {
      await db.insert(shoppingListItems).values({
        householdId,
        productId: t.productId,
        quantity: String(qty),
        unit: t.unit,
        source: 'auto',
        preferredStoreId: null,
      })
      created++
    }
  }

  // Verwaiste offene auto-Einträge entfernen: (a) Bedarf gedeckt, (b) alte Markt-Duplikate.
  for (const [productId, item] of openByProduct) {
    if (!stillNeeded.has(productId)) {
      await db.delete(shoppingListItems).where(eq(shoppingListItems.id, item.id))
      removed++
    }
  }
  for (const dup of orphans) {
    await db.delete(shoppingListItems).where(eq(shoppingListItems.id, dup.id))
    removed++
  }

  return { created, updated, removed }
}
