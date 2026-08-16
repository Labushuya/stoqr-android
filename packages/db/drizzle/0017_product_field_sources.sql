-- Block G15: Feld-Provenienz je Artikel (product_field_sources)
--
-- Genau EINE Zeile je (product_id, field): woher stammt der aktuelle Wert eines
-- Stammdaten-Felds — 'off' (OpenFoodFacts, initiale Basis), 'globus' (Markt-
-- Katalog-Abgleich) oder 'manual' (im Formular geaendert). Analog zu
-- product_nutrients. field ∈ 'name'|'brand'|'image'|'category'|'unit'.
-- Fehlt eine Zeile, ist die Herkunft unbekannt/Basis (UI zeigt kein Badge).
-- Additiv, kein Backfill, keine Alt-Daten betroffen.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_field_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "field" varchar(24) NOT NULL,
  "source" varchar(16) NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_field_sources"
    ADD CONSTRAINT "product_field_sources_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_field_sources_product_field_uniq"
  ON "product_field_sources" ("product_id", "field");
