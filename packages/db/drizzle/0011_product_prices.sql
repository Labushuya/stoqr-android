-- Block F / Inkrement M3: Preise je Artikel+Markt mit Historie (product_prices)
--
-- Append-only Historie. Genau EIN Eintrag je (product_id, store_id, household_id)
-- traegt is_current = true (partieller Unique-Index) = massgeblicher Preis fuers
-- Estimate. price_ct ist Cent PRO Einheit (unit). is_reduced markiert ein Angebot;
-- ein reduzierter Preis wird nur is_current, wenn er als Dauerpreis uebernommen wird.
-- Additiv, keine Alt-Daten betroffen.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_prices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "product_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "price_ct" integer NOT NULL,
  "unit" varchar(16) NOT NULL,
  "is_reduced" boolean DEFAULT false NOT NULL,
  "is_current" boolean DEFAULT false NOT NULL,
  "source" varchar(16) NOT NULL,
  "note" text,
  "recorded_at" timestamp DEFAULT now() NOT NULL,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_prices"
    ADD CONSTRAINT "product_prices_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_prices"
    ADD CONSTRAINT "product_prices_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_prices"
    ADD CONSTRAINT "product_prices_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_prices"
    ADD CONSTRAINT "product_prices_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Genau ein massgeblicher (is_current) Preis je Artikel+Markt+Haushalt.
CREATE UNIQUE INDEX IF NOT EXISTS "product_prices_current_uniq"
  ON "product_prices" ("product_id", "store_id", "household_id") WHERE "is_current" = true;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_prices_product_household_idx"
  ON "product_prices" ("product_id", "household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_prices_store_idx"
  ON "product_prices" ("store_id");
