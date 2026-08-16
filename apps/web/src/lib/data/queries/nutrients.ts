import { getDb } from '$data/db'
import { nutrientTypes, productNutrients } from '@stoqr/db'
import { and, asc, eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Nährstofftypen & produktbezogene Nährwerte
//
// nutrient_types sind global/geteilt (kein householdId) — Nährstoffe sind
// universell. product_nutrients hängen am Produkt (unique productId+nutrientTypeId),
// gelten also für alle Bestände desselben Artikels.
// ---------------------------------------------------------------------------

/**
 * Erzeugt einen URL-tauglichen Slug aus einem Namen.
 * Deutsche Umlaute werden transliteriert; alles Nicht-Alphanumerische wird zu '-'.
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function getNutrientTypes() {
  const db = getDb()
  return db.query.nutrientTypes.findMany({
    orderBy: [asc(nutrientTypes.sortOrder), asc(nutrientTypes.name)],
  })
}

/**
 * Legt einen (Custom-)Nährstofftyp an. Idempotent: existiert der Slug bereits,
 * wird der bestehende Typ zurückgegeben (kein Fehler, kein Duplikat).
 */
export async function createNutrientType(input: { name: string; unit: string }) {
  const db = getDb()
  const slug = slugify(input.name)
  if (!slug) throw new Error('Ungültiger Name')

  await db
    .insert(nutrientTypes)
    .values({ slug, name: input.name.trim(), unit: input.unit.trim(), sortOrder: 900 })
    .onConflictDoNothing({ target: nutrientTypes.slug })

  const row = await db.query.nutrientTypes.findFirst({
    where: eq(nutrientTypes.slug, slug),
  })
  if (!row) throw new Error('Nährstofftyp konnte nicht angelegt werden')
  return row
}

/**
 * Setzt/aktualisiert einen Nährwert eines Produkts (Upsert auf productId+nutrientTypeId).
 * Gibt die Zeile inkl. nutrientType zurück (für optimistische UI-Updates).
 */
export async function upsertProductNutrient(input: {
  productId: string
  nutrientTypeId: string
  valuePer100: number | string
  source?: string
}) {
  const db = getDb()
  await db
    .insert(productNutrients)
    .values({
      productId: input.productId,
      nutrientTypeId: input.nutrientTypeId,
      valuePer100: String(input.valuePer100),
      source: input.source ?? 'manual',
    })
    .onConflictDoUpdate({
      target: [productNutrients.productId, productNutrients.nutrientTypeId],
      set: {
        valuePer100: String(input.valuePer100),
        source: input.source ?? 'manual',
        updatedAt: new Date(),
      },
    })

  const row = await db.query.productNutrients.findFirst({
    where: and(
      eq(productNutrients.productId, input.productId),
      eq(productNutrients.nutrientTypeId, input.nutrientTypeId)
    ),
    with: { nutrientType: true },
  })
  return row ?? null
}

export async function deleteProductNutrient(input: {
  productId: string
  nutrientTypeId: string
}): Promise<{ deleted: boolean }> {
  const db = getDb()
  const [row] = await db
    .delete(productNutrients)
    .where(
      and(
        eq(productNutrients.productId, input.productId),
        eq(productNutrients.nutrientTypeId, input.nutrientTypeId)
      )
    )
    .returning({ id: productNutrients.id })
  return { deleted: !!row }
}
