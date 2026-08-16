-- ---------------------------------------------------------------------------
-- stoqr reference seed
-- Run manually with:
--   docker compose exec postgres psql -U stoqr -d stoqr_dev -f /seed.sql
--
-- All inserts use ON CONFLICT DO NOTHING — safe to re-run at any time.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- nutrient_types
-- Pass 1: root rows (no parent)
-- ---------------------------------------------------------------------------

INSERT INTO nutrient_types (id, slug, name, unit, parent_id, sort_order, off_key) VALUES
  (gen_random_uuid(), 'energy_kcal',   'Energie (kcal)',                  'kcal', NULL,  0,  'energy-kcal_100g'),
  (gen_random_uuid(), 'energy_kj',     'Energie (kJ)',                    'kJ',   NULL,  1,  'energy-kj_100g'),
  (gen_random_uuid(), 'fat_total',     'Fett',                            'g',    NULL,  10, 'fat_100g'),
  (gen_random_uuid(), 'carbs_total',   'Kohlenhydrate',                   'g',    NULL,  20, 'carbohydrates_100g'),
  (gen_random_uuid(), 'fiber',         'Ballaststoffe',                   'g',    NULL,  30, 'fiber_100g'),
  (gen_random_uuid(), 'protein',       'Eiweiß',                          'g',    NULL,  40, 'proteins_100g'),
  (gen_random_uuid(), 'salt',          'Salz',                            'g',    NULL,  50, 'salt_100g'),
  (gen_random_uuid(), 'vitamin_c',     'Vitamin C',                       'mg',   NULL,  60, 'vitamin-c_100g'),
  (gen_random_uuid(), 'calcium',       'Calcium',                         'mg',   NULL,  70, 'calcium_100g'),
  (gen_random_uuid(), 'iron',          'Eisen',                           'mg',   NULL,  80, 'iron_100g')
ON CONFLICT (slug) DO NOTHING;

-- Pass 2: child rows — parent_id resolved via sub-select by slug
INSERT INTO nutrient_types (id, slug, name, unit, parent_id, sort_order, off_key)
SELECT
  gen_random_uuid(),
  child.slug,
  child.name,
  child.unit,
  (SELECT id FROM nutrient_types WHERE slug = child.parent_slug),
  child.sort_order,
  child.off_key
FROM (VALUES
  ('fat_saturated',  'davon gesättigte Fettsäuren', 'g', 'fat_total',   11, 'saturated-fat_100g'),
  ('carbs_sugar',    'davon Zucker',                'g', 'carbs_total', 21, 'sugars_100g')
) AS child(slug, name, unit, parent_slug, sort_order, off_key)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- categories (all top-level, no parent)
-- ---------------------------------------------------------------------------

INSERT INTO categories (id, slug, name, icon, default_expiry_tolerance_days, sort_order, parent_id) VALUES
  (gen_random_uuid(), 'fruits-vegetables', 'Obst & Gemüse',          '🥦', 0,   0,    NULL),
  (gen_random_uuid(), 'dairy',             'Milchprodukte',           '🥛', 0,   1,    NULL),
  (gen_random_uuid(), 'meat-fish',         'Fleisch & Fisch',         '🥩', 0,   2,    NULL),
  (gen_random_uuid(), 'bakery',            'Brot & Backwaren',        '🍞', 0,   3,    NULL),
  (gen_random_uuid(), 'canned-frozen',     'Konserven & Tiefkühl',    '🥫', 180, 4,    NULL),
  (gen_random_uuid(), 'beverages',         'Getränke',                '🍺', 0,   5,    NULL),
  (gen_random_uuid(), 'snacks',            'Süßigkeiten & Snacks',    '🍫', 0,   6,    NULL),
  (gen_random_uuid(), 'condiments',        'Gewürze & Soßen',         '🧂', 0,   7,    NULL),
  (gen_random_uuid(), 'other',             'Sonstiges',               '📦', 0,   8,    NULL)
ON CONFLICT (slug) DO NOTHING;
