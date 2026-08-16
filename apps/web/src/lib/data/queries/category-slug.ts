// Reine Kategorie-Helfer OHNE DB-Abhaengigkeit — separat gehalten, damit sie in
// Unit-Tests ohne Datenbank-Verbindung importiert werden koennen (categories.ts
// importiert den DB-Client und ist daher nicht test-freundlich).

// Die 9 Seed-Slugs (packages/db/drizzle/seed.sql). Duerfen umbenannt, aber NICHT
// geloescht werden — Mapping-Fallbacks/Seed-Annahmen haengen daran.
export const SEED_CATEGORY_SLUGS = [
  'fruits-vegetables',
  'dairy',
  'meat-fish',
  'bakery',
  'canned-frozen',
  'beverages',
  'snacks',
  'condiments',
  'other',
] as const

export function isSeedCategorySlug(slug: string): boolean {
  return (SEED_CATEGORY_SLUGS as readonly string[]).includes(slug)
}

/**
 * Slug aus einem Namen erzeugen: lowercase, deutsche Umlaute transliteriert,
 * alles Nicht-alphanumerische zu '-', Mehrfach-/Rand-Bindestriche entfernt.
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
