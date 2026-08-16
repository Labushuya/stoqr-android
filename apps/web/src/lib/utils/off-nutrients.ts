// ---------------------------------------------------------------------------
// Open-Food-Facts-Nährwert-Extraktion (reine Funktion, testbar) — Block G12.
//
// Der offKey ist der rohe OFF-Nutriment-Schlüssel (…_100g) UND zugleich der
// Join-Key auf nutrient_types.off_key (Seed-Wahrheit). Bewusst KEIN interner
// Slug: der Lookup läuft über offKey, damit die früher divergierenden
// Slug-Konventionen (Seed vs. barcode-Endpunkt) irrelevant sind — sonst fielen
// abgerufene Nährwerte stillschweigend weg.
// ---------------------------------------------------------------------------

export type OffNutrient = { offKey: string; valuePer100: number; unit: string }

// Alle 12 vom Seed geführten Nährstoff-Typen (packages/db/seeds/nutrient-types.ts).
export const OFF_NUTRIENT_MAP: Array<{ offKey: string; unit: string }> = [
  { offKey: 'energy-kcal_100g',   unit: 'kcal' },
  { offKey: 'energy-kj_100g',     unit: 'kJ'   },
  { offKey: 'fat_100g',           unit: 'g'    },
  { offKey: 'saturated-fat_100g', unit: 'g'    },
  { offKey: 'carbohydrates_100g', unit: 'g'    },
  { offKey: 'sugars_100g',        unit: 'g'    },
  { offKey: 'proteins_100g',      unit: 'g'    },
  { offKey: 'fiber_100g',         unit: 'g'    },
  { offKey: 'salt_100g',          unit: 'g'    },
  { offKey: 'vitamin-c_100g',     unit: 'mg'   },
  { offKey: 'calcium_100g',       unit: 'mg'   },
  { offKey: 'iron_100g',          unit: 'mg'   },
]

/** Extrahiert die bekannten Nährwerte aus einem OFF-`nutriments`-Objekt. */
export function extractOffNutrients(
  nutriments: Record<string, unknown> | undefined | null
): OffNutrient[] {
  if (!nutriments) return []
  return OFF_NUTRIENT_MAP.flatMap(({ offKey, unit }) => {
    const value = nutriments[offKey]
    if (value == null || isNaN(Number(value))) return []
    return [{ offKey, valuePer100: Number(value), unit }]
  })
}
