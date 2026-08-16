import { db } from '../src/client'
import { nutrientTypes } from '../src/schema'

// ---------------------------------------------------------------------------
// Seed data
// parent_id values are resolved by slug at runtime — stored as slugs here,
// translated to UUIDs after the non-parent rows are inserted.
// ---------------------------------------------------------------------------

export type NutrientTypeSeed = {
  slug: string
  name: string
  unit: string
  parentSlug: string | null
  sortOrder: number
  offKey: string | null
}

export const nutrientTypeSeeds: NutrientTypeSeed[] = [
  {
    slug: 'energy_kcal',
    name: 'Energie (kcal)',
    unit: 'kcal',
    parentSlug: null,
    sortOrder: 0,
    offKey: 'energy-kcal_100g',
  },
  {
    slug: 'energy_kj',
    name: 'Energie (kJ)',
    unit: 'kJ',
    parentSlug: null,
    sortOrder: 1,
    offKey: 'energy-kj_100g',
  },
  {
    slug: 'fat_total',
    name: 'Fett',
    unit: 'g',
    parentSlug: null,
    sortOrder: 10,
    offKey: 'fat_100g',
  },
  {
    slug: 'fat_saturated',
    name: 'davon gesättigte Fettsäuren',
    unit: 'g',
    parentSlug: 'fat_total',
    sortOrder: 11,
    offKey: 'saturated-fat_100g',
  },
  {
    slug: 'carbs_total',
    name: 'Kohlenhydrate',
    unit: 'g',
    parentSlug: null,
    sortOrder: 20,
    offKey: 'carbohydrates_100g',
  },
  {
    slug: 'carbs_sugar',
    name: 'davon Zucker',
    unit: 'g',
    parentSlug: 'carbs_total',
    sortOrder: 21,
    offKey: 'sugars_100g',
  },
  {
    slug: 'fiber',
    name: 'Ballaststoffe',
    unit: 'g',
    parentSlug: null,
    sortOrder: 30,
    offKey: 'fiber_100g',
  },
  {
    slug: 'protein',
    name: 'Eiweiß',
    unit: 'g',
    parentSlug: null,
    sortOrder: 40,
    offKey: 'proteins_100g',
  },
  {
    slug: 'salt',
    name: 'Salz',
    unit: 'g',
    parentSlug: null,
    sortOrder: 50,
    offKey: 'salt_100g',
  },
  {
    slug: 'vitamin_c',
    name: 'Vitamin C',
    unit: 'mg',
    parentSlug: null,
    sortOrder: 60,
    offKey: 'vitamin-c_100g',
  },
  {
    slug: 'calcium',
    name: 'Calcium',
    unit: 'mg',
    parentSlug: null,
    sortOrder: 70,
    offKey: 'calcium_100g',
  },
  {
    slug: 'iron',
    name: 'Eisen',
    unit: 'mg',
    parentSlug: null,
    sortOrder: 80,
    offKey: 'iron_100g',
  },
]

export async function runSeed(): Promise<void> {
  // Pass 1 — insert rows that have no parent (parentSlug === null).
  // Use onConflictDoNothing so re-runs are idempotent.
  const rootSeeds = nutrientTypeSeeds.filter((s) => s.parentSlug === null)

  await db
    .insert(nutrientTypes)
    .values(
      rootSeeds.map((s) => ({
        slug: s.slug,
        name: s.name,
        unit: s.unit,
        parentId: null,
        sortOrder: s.sortOrder,
        offKey: s.offKey,
      }))
    )
    .onConflictDoNothing({ target: nutrientTypes.slug })

  // Pass 2 — resolve parent UUIDs, then insert child rows.
  const childSeeds = nutrientTypeSeeds.filter((s) => s.parentSlug !== null)
  if (childSeeds.length === 0) return

  // Fetch all inserted roots so we can resolve slug → id.
  const inserted = await db.query.nutrientTypes.findMany()
  const slugToId = new Map(inserted.map((r) => [r.slug, r.id]))

  await db
    .insert(nutrientTypes)
    .values(
      childSeeds.map((s) => {
        const parentId = slugToId.get(s.parentSlug!)
        if (!parentId) {
          throw new Error(
            `nutrient-types seed: cannot resolve parentSlug "${s.parentSlug}" for "${s.slug}"`
          )
        }
        return {
          slug: s.slug,
          name: s.name,
          unit: s.unit,
          parentId,
          sortOrder: s.sortOrder,
          offKey: s.offKey,
        }
      })
    )
    .onConflictDoNothing({ target: nutrientTypes.slug })

  console.log(`[seed] nutrient_types: ${nutrientTypeSeeds.length} rows ensured`)
}
