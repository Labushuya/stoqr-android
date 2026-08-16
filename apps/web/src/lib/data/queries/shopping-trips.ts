import { getDb } from '$data/db'
import { shoppingTrips, shoppingTripItems, shoppingListItems } from '@stoqr/db'
import { and, eq, desc } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Einkauf-Runs (Block E / M2)
//
// Ein shopping_trip ist ein konkreter Einkaufsvorgang mit Status. Positionen
// (shopping_trip_items) reservieren jeweils genau einen Bedarf. Status-Regeln:
//   begonnen ↔ pausiert → beendet (terminal). Hoechstens ein 'begonnen' je
//   Haushalt (partieller Unique-Index; resume/create loesen den aktiven zuvor auf).
// ---------------------------------------------------------------------------

export type TripStatus = 'begonnen' | 'pausiert' | 'beendet'

// ── Lesen ────────────────────────────────────────────────────────────────

export async function listTrips(householdId: string) {
  const db = getDb()
  const rows = await db.query.shoppingTrips.findMany({
    where: (t, { eq }) => eq(t.householdId, householdId),
    orderBy: [desc(shoppingTrips.startedAt)],
    with: {
      store: { columns: { id: true, name: true, chain: true } },
      items: { columns: { id: true } },
    },
  })
  // itemCount mitliefern; items-Array selbst nicht durchreichen (Übersicht braucht nur die Zahl).
  return rows.map(({ items, ...trip }) => ({ ...trip, itemCount: items.length }))
}

export async function getTrip(id: string, householdId: string) {
  const db = getDb()
  const trip = await db.query.shoppingTrips.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, id), eq(t.householdId, householdId)),
    with: {
      store: { columns: { id: true, name: true, chain: true } },
      items: {
        with: { product: { columns: { id: true, name: true } } },
      },
    },
  })
  return trip ?? null
}

// ── Anlegen ──────────────────────────────────────────────────────────────

/**
 * Legt einen neuen Run an (Status 'begonnen'). Setzt einen evtl. bereits aktiven
 * Run desselben Haushalts zuvor auf 'pausiert' (nur einer aktiv).
 *
 * Wiederverwendung: existiert bereits ein LEERER (keine Positionen), nicht-beendeter
 * Run desselben Markts, wird dieser aktiviert und zurückgegeben — verhindert das
 * Anhäufen leerer Runs.
 */
export async function createTrip(input: {
  householdId: string
  name?: string | null
  storeId?: string | null
}) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const targetStore = input.storeId || null

    // Vorhandene nicht-beendete Runs desselben Markts + deren Positionszahl.
    const candidates = await tx.query.shoppingTrips.findMany({
      where: (t, { and, eq, ne }) => and(eq(t.householdId, input.householdId), ne(t.status, 'beendet')),
      with: { items: { columns: { id: true } } },
    })
    const reusable = candidates.find(
      (t) => (t.storeId ?? null) === targetStore && t.items.length === 0,
    )

    // Aktiven Run pausieren (Invariante: max. einer 'begonnen').
    await tx
      .update(shoppingTrips)
      .set({ status: 'pausiert', updatedAt: new Date() })
      .where(and(eq(shoppingTrips.householdId, input.householdId), eq(shoppingTrips.status, 'begonnen')))

    if (reusable) {
      const [row] = await tx
        .update(shoppingTrips)
        .set({
          status: 'begonnen',
          name: input.name?.trim() || reusable.name || null,
          updatedAt: new Date(),
        })
        .where(eq(shoppingTrips.id, reusable.id))
        .returning()
      return row
    }

    const [row] = await tx
      .insert(shoppingTrips)
      .values({
        householdId: input.householdId,
        name: input.name?.trim() || null,
        storeId: targetStore,
        status: 'begonnen',
      })
      .returning()
    return row
  })
}

// ── Status-Übergänge ───────────────────────────────────────────────────────

/** Setzt einen Run auf 'pausiert'. */
export async function pauseTrip(id: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .update(shoppingTrips)
    .set({ status: 'pausiert', updatedAt: new Date() })
    .where(
      and(
        eq(shoppingTrips.id, id),
        eq(shoppingTrips.householdId, householdId),
        eq(shoppingTrips.status, 'begonnen'),
      ),
    )
    .returning()
  return row ?? null
}

/**
 * Setzt einen pausierten Run auf 'begonnen'. Loest zuvor den aktuell aktiven Run
 * (falls vorhanden) auf 'pausiert' — transaktional, damit der partielle Unique-
 * Index nicht zuschlaegt.
 */
export async function resumeTrip(id: string, householdId: string) {
  const db = getDb()
  return db.transaction(async (tx) => {
    await tx
      .update(shoppingTrips)
      .set({ status: 'pausiert', updatedAt: new Date() })
      .where(and(eq(shoppingTrips.householdId, householdId), eq(shoppingTrips.status, 'begonnen')))
    const [row] = await tx
      .update(shoppingTrips)
      .set({ status: 'begonnen', updatedAt: new Date() })
      .where(
        and(
          eq(shoppingTrips.id, id),
          eq(shoppingTrips.householdId, householdId),
          eq(shoppingTrips.status, 'pausiert'),
        ),
      )
      .returning()
    return row ?? null
  })
}

export class TripEndBlockedError extends Error {
  constructor(public readonly pendingCount: number) {
    super(`Es sind noch ${pendingCount} gekaufte Position(en) nicht eingebucht.`)
    this.name = 'TripEndBlockedError'
  }
}

/**
 * Beendet einen Run. Blockiert (TripEndBlockedError), solange 'gekauft'-Positionen
 * existieren, die noch nicht eingebucht wurden. Loest offene/ausverkaufte
 * Positionen (deren Bedarf kehrt in den Backlog zurueck), setzt status='beendet'.
 */
export async function endTrip(id: string, householdId: string) {
  const db = getDb()
  return db.transaction(async (tx) => {
    const trip = await tx.query.shoppingTrips.findFirst({
      where: (t, { and, eq }) => and(eq(t.id, id), eq(t.householdId, householdId)),
    })
    if (!trip) return null
    if (trip.status === 'beendet') return trip

    const items = await tx.query.shoppingTripItems.findMany({
      where: (i, { eq }) => eq(i.tripId, id),
      columns: { id: true, realStatus: true },
    })
    const pending = items.filter((i) => i.realStatus === 'gekauft')
    if (pending.length > 0) throw new TripEndBlockedError(pending.length)

    // offene + ausverkaufte Positionen freigeben → Bedarf zurueck im Backlog.
    await tx
      .delete(shoppingTripItems)
      .where(eq(shoppingTripItems.tripId, id))

    const [row] = await tx
      .update(shoppingTrips)
      .set({ status: 'beendet', endedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
      .returning()
    return row ?? null
  })
}

/** Aktualisiert Run-Stammdaten (name/storeId). */
export async function updateTrip(
  id: string,
  householdId: string,
  data: Partial<{ name: string | null; storeId: string | null }>,
) {
  const db = getDb()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.name !== undefined) patch.name = data.name?.trim() || null
  if (data.storeId !== undefined) patch.storeId = data.storeId || null
  const [row] = await db
    .update(shoppingTrips)
    .set(patch)
    .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
    .returning()
  return row ?? null
}

/** Loescht einen Run (Positionen via cascade; deren Bedarfe bleiben im Backlog). */
export async function deleteTrip(id: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .delete(shoppingTrips)
    .where(and(eq(shoppingTrips.id, id), eq(shoppingTrips.householdId, householdId)))
    .returning({ id: shoppingTrips.id })
  return { deleted: !!row }
}

// ---------------------------------------------------------------------------
// Positionen (Reservierung eines Bedarfs für einen Run)
// ---------------------------------------------------------------------------

/**
 * Reserviert einen Bedarf (shopping_list_item) für einen Run: legt eine
 * shopping_trip_items-Position an und kopiert die Bedarf-Felder (denormalisiert).
 * Der Unique-Index auf shopping_list_item_id erzwingt "1 Bedarf = 1 Run" —
 * eine Doppel-Reservierung wirft (23505), vom API-Layer als 409 gemeldet.
 */
export async function reserveNeed(shoppingListItemId: string, tripId: string, householdId: string) {
  const db = getDb()
  const need = await db.query.shoppingListItems.findFirst({
    where: (s, { and, eq }) => and(eq(s.id, shoppingListItemId), eq(s.householdId, householdId)),
  })
  if (!need) return null

  // Trip muss demselben Haushalt gehoeren.
  const trip = await db.query.shoppingTrips.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, tripId), eq(t.householdId, householdId)),
    columns: { id: true },
  })
  if (!trip) return null

  const [row] = await db
    .insert(shoppingTripItems)
    .values({
      tripId,
      householdId,
      shoppingListItemId,
      productId: need.productId ?? null,
      freeTextName: need.freeTextName ?? null,
      quantity: need.quantity,
      unit: need.unit,
      realStatus: 'offen',
    })
    .returning()
  return row
}

/**
 * Reserviert alle offenen Bedarfe eines Marktes (plus markt-lose) für einen Run,
 * die noch nicht reserviert sind. Gibt die Anzahl neu reservierter Positionen zurück.
 */
export async function reserveAllForStore(tripId: string, storeId: string | null, householdId: string) {
  const db = getDb()
  const trip = await db.query.shoppingTrips.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, tripId), eq(t.householdId, householdId)),
    columns: { id: true },
  })
  if (!trip) return { reserved: 0 }

  // Offene Bedarfe des Haushalts (nicht abgehakt).
  const needs = await db.query.shoppingListItems.findMany({
    where: (s, { and, eq }) => and(eq(s.householdId, householdId), eq(s.isChecked, false)),
  })
  // Bereits reservierte Bedarfe ausschliessen.
  const reserved = await db.query.shoppingTripItems.findMany({
    where: (i, { eq }) => eq(i.householdId, householdId),
    columns: { shoppingListItemId: true },
  })
  const reservedIds = new Set(reserved.map((r) => r.shoppingListItemId))

  const matching = needs.filter(
    (n) => !reservedIds.has(n.id) && (n.preferredStoreId === storeId || n.preferredStoreId == null),
  )
  if (matching.length === 0) return { reserved: 0 }

  await db.insert(shoppingTripItems).values(
    matching.map((n) => ({
      tripId,
      householdId,
      shoppingListItemId: n.id,
      productId: n.productId ?? null,
      freeTextName: n.freeTextName ?? null,
      quantity: n.quantity,
      unit: n.unit,
      realStatus: 'offen' as const,
    })),
  )
  return { reserved: matching.length }
}

/** Verschiebt eine Position in einen anderen Run desselben Haushalts. */
export async function moveTripItem(tripItemId: string, toTripId: string, householdId: string) {
  const db = getDb()
  const target = await db.query.shoppingTrips.findFirst({
    where: (t, { and, eq }) => and(eq(t.id, toTripId), eq(t.householdId, householdId)),
    columns: { id: true },
  })
  if (!target) return null
  const [row] = await db
    .update(shoppingTripItems)
    .set({ tripId: toTripId, updatedAt: new Date() })
    .where(and(eq(shoppingTripItems.id, tripItemId), eq(shoppingTripItems.householdId, householdId)))
    .returning()
  return row ?? null
}

/** Aktualisiert eine Position (realStatus / Menge / Notiz). */
export async function updateTripItem(
  tripItemId: string,
  householdId: string,
  data: Partial<{ realStatus: 'offen' | 'gekauft' | 'ausverkauft'; quantity: number | string; notes: string | null }>,
) {
  const db = getDb()
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (data.realStatus !== undefined) patch.realStatus = data.realStatus
  if (data.quantity !== undefined) patch.quantity = String(data.quantity)
  if (data.notes !== undefined) patch.notes = data.notes
  const [row] = await db
    .update(shoppingTripItems)
    .set(patch)
    .where(and(eq(shoppingTripItems.id, tripItemId), eq(shoppingTripItems.householdId, householdId)))
    .returning()
  return row ?? null
}

/** Loest eine Reservierung (Position weg, Bedarf bleibt im Backlog). */
export async function releaseTripItem(tripItemId: string, householdId: string) {
  const db = getDb()
  const [row] = await db
    .delete(shoppingTripItems)
    .where(and(eq(shoppingTripItems.id, tripItemId), eq(shoppingTripItems.householdId, householdId)))
    .returning({ id: shoppingTripItems.id })
  return { deleted: !!row }
}

/**
 * Bucht eine Position ein: loescht den zugehoerigen Bedarf (shopping_list_item),
 * wodurch die Trip-Position via cascade mitgeht. Wird nach erfolgreichem Anlegen
 * des echten Bestands (easy-add) aufgerufen. Gibt den geloeschten Bedarf-Verweis zurueck.
 */
export async function bookInTripItem(tripItemId: string, householdId: string) {
  const db = getDb()
  const item = await db.query.shoppingTripItems.findFirst({
    where: (i, { and, eq }) => and(eq(i.id, tripItemId), eq(i.householdId, householdId)),
    columns: { id: true, shoppingListItemId: true },
  })
  if (!item) return { booked: false }
  // Bedarf loeschen → cascade entfernt die Trip-Position.
  await db
    .delete(shoppingListItems)
    .where(and(eq(shoppingListItems.id, item.shoppingListItemId), eq(shoppingListItems.householdId, householdId)))
  return { booked: true }
}
