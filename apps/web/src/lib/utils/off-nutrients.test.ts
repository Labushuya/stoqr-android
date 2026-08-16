import { describe, it, expect } from 'vitest'
import { extractOffNutrients, OFF_NUTRIENT_MAP } from './off-nutrients'

// Die 12 offKeys, die der Seed (packages/db/seeds/nutrient-types.ts) fuehrt.
// Dieser Test ist der Vertrag: die Map im Endpunkt MUSS mit dem Seed
// uebereinstimmen — sonst faellt der frueher aufgetretene „Naehrwerte fallen
// stillschweigend weg"-Bug wieder auf.
const SEED_OFF_KEYS = [
  'energy-kcal_100g',
  'energy-kj_100g',
  'fat_100g',
  'saturated-fat_100g',
  'carbohydrates_100g',
  'sugars_100g',
  'proteins_100g',
  'fiber_100g',
  'salt_100g',
  'vitamin-c_100g',
  'calcium_100g',
  'iron_100g',
]

describe('OFF_NUTRIENT_MAP', () => {
  it('deckt genau die 12 Seed-offKeys ab (Map ↔ Seed-Vertrag)', () => {
    const mapKeys = OFF_NUTRIENT_MAP.map((m) => m.offKey).sort()
    expect(mapKeys).toEqual([...SEED_OFF_KEYS].sort())
  })

  it('offKeys sind eindeutig', () => {
    const keys = OFF_NUTRIENT_MAP.map((m) => m.offKey)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('extractOffNutrients', () => {
  it('leeres/fehlendes nutriments → []', () => {
    expect(extractOffNutrients(undefined)).toEqual([])
    expect(extractOffNutrients(null)).toEqual([])
    expect(extractOffNutrients({})).toEqual([])
  })

  it('extrahiert vorhandene Werte mit korrektem offKey + Einheit', () => {
    const out = extractOffNutrients({
      'energy-kcal_100g': 250,
      'fat_100g': 12.5,
      'salt_100g': 0.8,
    })
    expect(out).toContainEqual({ offKey: 'energy-kcal_100g', valuePer100: 250, unit: 'kcal' })
    expect(out).toContainEqual({ offKey: 'fat_100g', valuePer100: 12.5, unit: 'g' })
    expect(out).toContainEqual({ offKey: 'salt_100g', valuePer100: 0.8, unit: 'g' })
  })

  it('überspringt null/undefined/NaN-Werte', () => {
    const out = extractOffNutrients({
      'fat_100g': null as unknown as number,
      'salt_100g': undefined as unknown as number,
      'sugars_100g': 'keine-zahl' as unknown as number,
      'proteins_100g': 5,
    })
    expect(out).toEqual([{ offKey: 'proteins_100g', valuePer100: 5, unit: 'g' }])
  })

  it('akzeptiert numerische Strings (OFF liefert teils Strings)', () => {
    const out = extractOffNutrients({ 'carbohydrates_100g': '30.2' as unknown as number })
    expect(out).toEqual([{ offKey: 'carbohydrates_100g', valuePer100: 30.2, unit: 'g' }])
  })

  it('liefert alle 12 Typen, wenn alle vorhanden sind', () => {
    const full: Record<string, number> = {}
    for (const { offKey } of OFF_NUTRIENT_MAP) full[offKey] = 1
    expect(extractOffNutrients(full)).toHaveLength(12)
  })
})
