-- G20-1: System-Einheiten idempotent nachziehen
--
-- Ursache der "piece klebt"-Regression: in manchen DB-Staenden fehlt die
-- System-Einheit 'piece' (bzw. weitere) in der units-Tabelle — z.B. wenn der
-- INSERT aus 0002_households_units nicht sauber lief. Fehlt das Symbol, findet
-- die UI kein Label ('piece' wird roh angezeigt) und das <select> verhaelt sich
-- fehlerhaft.
--
-- Diese Migration fuegt die 9 System-Einheiten (household_id NULL, is_system=true)
-- STRIKT IDEMPOTENT nach — je Symbol nur, wenn noch KEINE System-Zeile mit diesem
-- Symbol existiert. Bestehende System- und haushaltsspezifische Einheiten bleiben
-- unangetastet (kein Overwrite). dimension/to_base_factor werden passend gesetzt
-- (Spalten existieren seit 0007).

--> statement-breakpoint
INSERT INTO "units" ("name", "symbol", "sort_order", "is_system", "dimension", "to_base_factor")
SELECT v.name, v.symbol, v.sort_order, true, v.dimension, v.to_base_factor::numeric(12,4)
FROM (VALUES
  ('Stück',    'piece',    1, 'count',  '1'),
  ('Gramm',    'g',        2, 'mass',   '1'),
  ('Kilogramm','kg',       3, 'mass',   '1000'),
  ('Milliliter','ml',      4, 'volume', '1'),
  ('Liter',    'l',        5, 'volume', '1000'),
  ('Packung',  'Packung',  6, 'count',  '1'),
  ('Dose',     'Dose',     7, 'count',  '1'),
  ('Flasche',  'Flasche',  8, 'count',  '1'),
  ('Tetrapak', 'Tetrapak', 9, 'count',  '1')
) AS v(name, symbol, sort_order, dimension, to_base_factor)
WHERE NOT EXISTS (
  SELECT 1 FROM "units" u
  WHERE u."symbol" = v.symbol AND u."household_id" IS NULL AND u."is_system" = true
);
