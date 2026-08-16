import { db } from '../src/client'
import { categories } from '../src/schema'

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

export type CategorySeed = {
  slug: string
  name: string
  icon: string
  defaultExpiryToleranceDays?: number
  sortOrder: number
}

export const categorySeeds: CategorySeed[] = [
  {
    slug: 'fruits-vegetables',
    name: 'Obst & Gemüse',
    icon: '🥦',
    sortOrder: 0,
  },
  {
    slug: 'dairy',
    name: 'Milchprodukte',
    icon: '🥛',
    sortOrder: 1,
  },
  {
    slug: 'meat-fish',
    name: 'Fleisch & Fisch',
    icon: '🥩',
    sortOrder: 2,
  },
  {
    slug: 'bakery',
    name: 'Brot & Backwaren',
    icon: '🍞',
    sortOrder: 3,
  },
  {
    slug: 'canned-frozen',
    name: 'Konserven & Tiefkühl',
    icon: '🥫',
    defaultExpiryToleranceDays: 180,
    sortOrder: 4,
  },
  {
    slug: 'beverages',
    name: 'Getränke',
    icon: '🍺',
    sortOrder: 5,
  },
  {
    slug: 'snacks',
    name: 'Süßigkeiten & Snacks',
    icon: '🍫',
    sortOrder: 6,
  },
  {
    slug: 'condiments',
    name: 'Gewürze & Soßen',
    icon: '🧂',
    sortOrder: 7,
  },
  {
    slug: 'other',
    name: 'Sonstiges',
    icon: '📦',
    sortOrder: 8,
  },
]

export async function runSeed(): Promise<void> {
  await db
    .insert(categories)
    .values(
      categorySeeds.map((s) => ({
        slug: s.slug,
        name: s.name,
        icon: s.icon,
        defaultExpiryToleranceDays: s.defaultExpiryToleranceDays ?? 0,
        sortOrder: s.sortOrder,
        parentId: null,
      }))
    )
    .onConflictDoNothing({ target: categories.slug })

  console.log(`[seed] categories: ${categorySeeds.length} rows ensured`)
}
