import { runSeed as seedNutrientTypes } from './nutrient-types'
import { runSeed as seedCategories } from './categories'

async function main(): Promise<void> {
  console.log('[seed] Starting...')

  await seedNutrientTypes()
  await seedCategories()

  console.log('[seed] Done.')
  process.exit(0)
}

main().catch((err) => {
  console.error('[seed] Fatal error:', err)
  process.exit(1)
})
