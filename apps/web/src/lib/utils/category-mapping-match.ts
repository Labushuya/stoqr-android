// DB-freier Matcher fuer Kategorie-Mapping-Regeln (G29). Rein funktional,
// unit-testbar. Match = GANZER Tag / GANZES Pfad-Segment, case-insensitiv.

export type MappingRule = { token: string; categoryId: string }

/** Normalisierung fuer Token beim Speichern UND beim Lookup (konsistent halten). */
export function normalizeToken(s: string): string {
  return s.trim().toLowerCase()
}

/**
 * Findet die erste passende categoryId fuer eine Liste von Tokens.
 * - Globus: `tokens` = Pfad-Segmente; SPEZIFISCHSTE zuerst pruefen (von hinten),
 *   damit z.B. "Joghurt" vor dem Ober-Segment "Kuehlregal" gewinnt.
 * - OFF: `tokens` = categories_tags (Reihenfolge egal, alle geprueft).
 * Regeln werden als Map token→categoryId uebergeben (bereits normalisiert).
 * Rueckgabe: categoryId oder null.
 */
export function matchMappingRules(
  tokens: string[] | null | undefined,
  rulesByToken: Map<string, string>,
  opts: { specificLast?: boolean } = {}
): string | null {
  if (!tokens?.length || rulesByToken.size === 0) return null
  const seq = opts.specificLast ? [...tokens].reverse() : tokens
  for (const raw of seq) {
    const t = normalizeToken(raw ?? '')
    if (t === '') continue
    const hit = rulesByToken.get(t)
    if (hit) return hit
  }
  return null
}
