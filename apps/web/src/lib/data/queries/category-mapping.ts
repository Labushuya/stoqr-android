import { getDb } from '$data/db'
import { categoryMappings, categories } from '@stoqr/db'
import { and, eq } from 'drizzle-orm'
import { matchMappingRules, normalizeToken } from '$lib/utils/category-mapping-match'

// ---------------------------------------------------------------------------
// Kategorie-Mapping-Regeln (G29). Household-scoped. resolveMappedCategory greift
// beim OFF-Scan/Globus-Sync VOR dem Code-Fallback; matchMappingRules ist der
// reine, getestete Matcher.
// ---------------------------------------------------------------------------

export type CategoryMappingRow = typeof categoryMappings.$inferSelect

/**
 * Erste passende categoryId fuer die Regeln des Haushalts.
 * Globus-Segmente werden spezifischste-zuerst geprueft (specificLast).
 */
export async function resolveMappedCategory(
  source: 'off' | 'globus',
  tokens: string[] | null | undefined,
  householdId: string
): Promise<string | null> {
  const db = getDb()
  if (!tokens?.length) return null
  const rows = await db
    .select({ token: categoryMappings.token, categoryId: categoryMappings.categoryId })
    .from(categoryMappings)
    .where(and(eq(categoryMappings.householdId, householdId), eq(categoryMappings.source, source)))
  if (rows.length === 0) return null
  const byToken = new Map(rows.map((r) => [r.token, r.categoryId]))
  return matchMappingRules(tokens, byToken, { specificLast: source === 'globus' })
}

export type CategoryMappingListItem = CategoryMappingRow & { categoryName: string | null }

/** Regeln des Haushalts + Ziel-Kategorie-Name (fuer die Anzeige). */
export async function listCategoryMappings(householdId: string): Promise<CategoryMappingListItem[]> {
  const db = getDb()
  const rows = await db.query.categoryMappings.findMany({
    where: eq(categoryMappings.householdId, householdId),
    with: { category: { columns: { name: true } } },
  })
  return rows.map((r) => ({ ...r, categoryName: r.category?.name ?? null }))
}

export type CreateMappingResult =
  | { ok: true; row: CategoryMappingListItem }
  | { ok: false; reason: 'bad-input' | 'no-category' | 'duplicate'; detail?: string }

export async function createCategoryMapping(
  householdId: string,
  input: { source: string; token: string; categoryId: string }
): Promise<CreateMappingResult> {
  const db = getDb()
  const source = input.source === 'globus' ? 'globus' : input.source === 'off' ? 'off' : null
  const token = normalizeToken(input.token ?? '')
  if (!source || token === '' || !input.categoryId) {
    return { ok: false, reason: 'bad-input', detail: 'Quelle, Token und Kategorie sind erforderlich.' }
  }
  const cat = await db.query.categories.findFirst({
    where: eq(categories.id, input.categoryId),
    columns: { id: true, name: true },
  })
  if (!cat) return { ok: false, reason: 'no-category' }

  const existing = await db
    .select({ id: categoryMappings.id })
    .from(categoryMappings)
    .where(
      and(
        eq(categoryMappings.householdId, householdId),
        eq(categoryMappings.source, source),
        eq(categoryMappings.token, token)
      )
    )
  if (existing.length > 0) {
    return { ok: false, reason: 'duplicate', detail: 'Für diese Quelle und diesen Token existiert bereits eine Regel.' }
  }

  const [row] = await db
    .insert(categoryMappings)
    .values({ householdId, source, token, categoryId: input.categoryId })
    .returning()
  // categoryName mitliefern, damit die POST-Antwort direkt anzeigbar ist (G30-1).
  return { ok: true, row: { ...row, categoryName: cat.name } }
}

/** Loescht eine Regel (household-scoped). Liefert die geloeschte Zeile oder null. */
export async function deleteCategoryMapping(
  id: string,
  householdId: string
): Promise<CategoryMappingRow | null> {
  const db = getDb()
  const [row] = await db
    .delete(categoryMappings)
    .where(and(eq(categoryMappings.id, id), eq(categoryMappings.householdId, householdId)))
    .returning()
  return row ?? null
}
