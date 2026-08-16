-- Block G29: Kategorie-Mapping-Regeln (category_mappings)
--
-- Household-scoped Regeln, die einen OFF-Tag (source 'off') bzw. ein Globus-
-- Pfad-Segment (source 'globus') — normalisiert als lowercase token — auf eine
-- stoqr-Kategorie mappen. Greifen beim Barcode-Scan und Katalog-Sync automatisch,
-- VOR dem Code-Fallback. Manuelle Kategorie-Wahl (G20-2) bleibt Vorrang.
-- Genau EINE Regel je (household_id, source, token). Additiv, kein Backfill.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "category_mappings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "source" varchar(8) NOT NULL,
  "token" text NOT NULL,
  "category_id" uuid NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "category_mappings"
    ADD CONSTRAINT "category_mappings_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "category_mappings"
    ADD CONSTRAINT "category_mappings_category_id_categories_id_fk"
    FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "category_mappings_uniq"
  ON "category_mappings" ("household_id", "source", "token");
