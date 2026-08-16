-- Block G7: Globus-Katalog-Snapshots (Roh-Landing-Zone + Historie + Approval)
--
-- Speichert je Artikel-EAN das komplette verifizierte Globus-Suggest-JSON
-- (name, category, price, currency, Bild + Rohdaten). Aenderung unter gleicher
-- EAN erzeugt einen neuen 'proposed'-Snapshot, der wie Preisvorschlaege
-- bestaetigt/verworfen wird. product_id/store_id nullable (Landing-Zone kann vor
-- Produkt-Match existieren). Additiv, keine Alt-Daten betroffen.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "globus_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "product_id" uuid,
  "store_id" uuid,
  "gtin" varchar(14) NOT NULL,
  "name" varchar(255),
  "category" text[],
  "price_ct" integer,
  "currency" varchar(8),
  "image_remote_url" text,
  "local_image_path" text,
  "raw_json" jsonb NOT NULL,
  "status" varchar(16) DEFAULT 'proposed' NOT NULL,
  "source" varchar(16) DEFAULT 'globus' NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  "reviewed_at" timestamp,
  "reviewed_by" text,
  "created_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "globus_snapshots"
    ADD CONSTRAINT "globus_snapshots_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "globus_snapshots"
    ADD CONSTRAINT "globus_snapshots_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "globus_snapshots"
    ADD CONSTRAINT "globus_snapshots_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "globus_snapshots"
    ADD CONSTRAINT "globus_snapshots_reviewed_by_users_id_fk"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "globus_snapshots"
    ADD CONSTRAINT "globus_snapshots_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "globus_snapshots_gtin_household_idx"
  ON "globus_snapshots" ("gtin", "household_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "globus_snapshots_product_idx"
  ON "globus_snapshots" ("product_id");
--> statement-breakpoint
-- Max. 1 offener Vorschlag je EAN+Haushalt.
CREATE UNIQUE INDEX IF NOT EXISTS "globus_snapshots_proposed_uniq"
  ON "globus_snapshots" ("gtin", "household_id") WHERE "status" = 'proposed';
