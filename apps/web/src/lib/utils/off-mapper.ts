export interface ParsedOffProduct {
  name: string;
  brand: string | null;
  imageUrl: string | null;
  defaultUnit: 'g' | 'ml' | null;
  defaultWeightG: number | null;
  defaultVolumeML: number | null;
  nutrients: Record<string, number>;
}

export function parseQuantityString(
  quantity: string
): { value: number; unit: 'g' | 'ml' | 'kg' | 'l' | null } {
  const match = quantity.trim().match(/^([\d.,]+)\s*(g|ml|kg|l)$/i);
  if (!match) {
    return { value: 0, unit: null };
  }

  const value = parseFloat(match[1].replace(',', '.'));
  const unit = match[2].toLowerCase() as 'g' | 'ml' | 'kg' | 'l';

  return { value, unit };
}

export function parseOffProduct(offData: Record<string, unknown>): ParsedOffProduct {
  const name =
    (offData['product_name_de'] as string | undefined) ??
    (offData['product_name'] as string | undefined) ??
    '';

  const brandsRaw = offData['brands'] as string | undefined | null;
  const brand = brandsRaw
    ? (brandsRaw.split(',')[0].trim() || null)
    : null;

  const imageUrl = (offData['image_url'] as string | undefined | null) ?? null;

  let defaultUnit: 'g' | 'ml' | null = null;
  let defaultWeightG: number | null = null;
  let defaultVolumeML: number | null = null;

  const quantityRaw = offData['quantity'] as string | undefined | null;
  if (quantityRaw) {
    const { value, unit } = parseQuantityString(quantityRaw);
    if (unit === 'g') {
      defaultWeightG = value;
      defaultUnit = 'g';
    } else if (unit === 'kg') {
      defaultWeightG = value * 1000;
      defaultUnit = 'g';
    } else if (unit === 'ml') {
      defaultVolumeML = value;
      defaultUnit = 'ml';
    } else if (unit === 'l') {
      defaultVolumeML = value * 1000;
      defaultUnit = 'ml';
    }
  }

  const nutriments = (offData['nutriments'] as Record<string, unknown> | undefined) ?? {};

  const rawNutrients: Record<string, unknown> = {
    energy_kcal: nutriments['energy-kcal_100g'],
    fat_total: nutriments['fat_100g'],
    fat_saturated: nutriments['saturated-fat_100g'],
    carbs_total: nutriments['carbohydrates_100g'],
    carbs_sugar: nutriments['sugars_100g'],
    protein: nutriments['proteins_100g'],
    salt: nutriments['salt_100g'],
    fiber: nutriments['fiber_100g'],
  };

  const nutrients: Record<string, number> = {};
  for (const [slug, val] of Object.entries(rawNutrients)) {
    if (val !== null && val !== undefined) {
      const num = typeof val === 'number' ? val : parseFloat(String(val));
      if (!isNaN(num)) {
        nutrients[slug] = num;
      }
    }
  }

  return {
    name,
    brand,
    imageUrl,
    defaultUnit,
    defaultWeightG,
    defaultVolumeML,
    nutrients,
  };
}
