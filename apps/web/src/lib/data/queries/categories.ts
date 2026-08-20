import { getDb } from '$data/db'
import { categories, products } from '$data/schema'
import { eq, asc, sql } from 'drizzle-orm'
import { isSeedCategorySlug, slugify } from './category-slug'
import { isDescendant, type CatNode } from '$lib/utils/category-tree'

// ---------------------------------------------------------------------------
// Kategorie-Verwaltung (Stufe 1: CRUD). categories ist GLOBAL (kein household_id) —
// die 9 Seed-Kategorien bilden die Basis und sind loeschgeschuetzt (bearbeitbar).
// Nesting (parentId) folgt in einer spaeteren Stufe; hier bleibt es unangetastet.
// Reine Helfer (slugify/isSeedCategorySlug/SEED_CATEGORY_SLUGS) leben in
// ./category-slug (DB-frei, unit-testbar) und werden hier re-exportiert.
// ---------------------------------------------------------------------------

export { SEED_CATEGORY_SLUGS, isSeedCategorySlug, slugify } from './category-slug'

export type CategoryRow = typeof categories.$inferSelect

/** Freien, eindeutigen Slug finden (Kollision → Suffix -2, -3, …). */
async function uniqueSlug(base: string): Promise<string> {
  const db = getDb()
  const root = base || 'kategorie'
  const existing = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(sql`${categories.slug} = ${root} OR ${categories.slug} LIKE ${root + '-%'}`)
  const taken = new Set(existing.map((r) => r.slug))
  if (!taken.has(root)) return root
  let n = 2
  while (taken.has(`${root}-${n}`)) n++
  return `${root}-${n}`
}

export function listCategories(): Promise<CategoryRow[]> {
  const db = getDb()
  return db
    .select()
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name))
}

export async function createCategory(input: {
  name: string
  icon?: string | null
  parentId?: string | null
}): Promise<CategoryRow> {
  const db = getDb()
  const name = input.name.trim()
  const slug = await uniqueSlug(slugify(name))
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)` })
    .from(categories)
  // parentId nur setzen, wenn er auf eine existierende Kategorie zeigt (sonst Wurzel).
  let parentId: string | null = null
  if (input.parentId) {
    const parent = await getCategoryById(input.parentId)
    parentId = parent ? input.parentId : null
  }
  const [row] = await db
    .insert(categories)
    .values({
      name,
      slug,
      icon: input.icon?.trim() || null,
      parentId,
      sortOrder: Number(max) + 1,
    })
    .returning()
  return row
}

export type UpdateResult =
  | { ok: true; row: CategoryRow }
  | { ok: false; reason: 'not-found' | 'cycle'; detail?: string }

export async function updateCategory(
  id: string,
  input: { name?: string; icon?: string | null; parentId?: string | null; defaultExpiryToleranceDays?: number }
): Promise<UpdateResult> {
  const db = getDb()
  const patch: Partial<{ name: string; icon: string | null; parentId: string | null; defaultExpiryToleranceDays: number }> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.icon !== undefined) patch.icon = input.icon?.trim() || null
  if (input.defaultExpiryToleranceDays !== undefined) {
    patch.defaultExpiryToleranceDays = input.defaultExpiryToleranceDays
  }

  if (input.parentId !== undefined) {
    const newParent = input.parentId || null
    if (newParent) {
      // Zyklus-Schutz: neuer Parent darf nicht die Kategorie selbst oder einer
      // ihrer Nachkommen sein. Ueber die gesamte (flache) Liste pruefen.
      const all = await listCategories()
      const nodes: CatNode[] = all.map((c) => ({
        id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, sortOrder: c.sortOrder,
      }))
      if (isDescendant(nodes, newParent, id)) {
        return { ok: false, reason: 'cycle', detail: 'Kategorie kann nicht ihrer eigenen Unterkategorie untergeordnet werden.' }
      }
    }
    patch.parentId = newParent
  }

  if (Object.keys(patch).length === 0) {
    const existing = await getCategoryById(id)
    return existing ? { ok: true, row: existing } : { ok: false, reason: 'not-found' }
  }
  const [row] = await db.update(categories).set(patch).where(eq(categories.id, id)).returning()
  return row ? { ok: true, row } : { ok: false, reason: 'not-found' }
}

export function getCategoryById(id: string): Promise<CategoryRow | undefined> {
  const db = getDb()
  return db.query.categories.findFirst({ where: eq(categories.id, id) })
}

export type DeleteResult =
  | { ok: true }
  | { ok: false; reason: 'not-found' | 'seed' | 'in-use'; detail?: string }

/**
 * Loescht eine Kategorie. Verweigert bei:
 *  - Seed-Kategorie (loeschgeschuetzt),
 *  - Verwendung an Produkten (409).
 * Kindkategorien (Stufe 2) werden hier noch nicht beruecksichtigt.
 */
export async function deleteCategory(id: string): Promise<DeleteResult> {
  const db = getDb()
  const cat = await getCategoryById(id)
  if (!cat) return { ok: false, reason: 'not-found' }
  if (isSeedCategorySlug(cat.slug)) {
    return { ok: false, reason: 'seed', detail: 'Basis-Kategorien können nicht gelöscht werden.' }
  }

  const [prod] = await db
    .select({ n: sql<number>`count(*)` })
    .from(products)
    .where(eq(products.categoryId, id))
  if (Number(prod.n) > 0) {
    return { ok: false, reason: 'in-use', detail: `Kategorie wird von ${Number(prod.n)} Artikel(n) verwendet.` }
  }

  // Vorwaertskompatibel (Stufe 2): keine Kategorie mit Unterkategorien loeschen.
  const [child] = await db
    .select({ n: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.parentId, id))
  if (Number(child.n) > 0) {
    return { ok: false, reason: 'in-use', detail: 'Kategorie hat Unterkategorien.' }
  }

  await db.delete(categories).where(eq(categories.id, id))
  return { ok: true }
}
