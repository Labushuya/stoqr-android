-- Block E / Inkrement M2: Einkauf-Entität (shopping_trips + shopping_trip_items)
--
-- Ein Einkauf-Run (shopping_trips) hat einen Status (begonnen|pausiert|beendet);
-- hoechstens einer je Haushalt ist 'begonnen' (partieller Unique-Index).
-- Eine Position (shopping_trip_items) reserviert genau einen Bedarf
-- (shopping_list_item_id UNIQUE) → "1 Bedarf = 1 Run". Loeschen des Runs oder des
-- Bedarfs raeumt die Position (ON DELETE CASCADE). Additiv, keine Alt-Daten betroffen.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shopping_trips" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "name" varchar(128),
  "store_id" uuid,
  "status" varchar(16) DEFAULT 'begonnen' NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "ended_at" timestamp,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trips"
    ADD CONSTRAINT "shopping_trips_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trips"
    ADD CONSTRAINT "shopping_trips_store_id_stores_id_fk"
    FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- Hoechstens ein aktiver ('begonnen') Run je Haushalt.
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_trips_active_uniq"
  ON "shopping_trips" ("household_id") WHERE "status" = 'begonnen';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shopping_trip_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trip_id" uuid NOT NULL,
  "household_id" text NOT NULL,
  "shopping_list_item_id" uuid NOT NULL,
  "product_id" uuid,
  "free_text_name" varchar(255),
  "quantity" numeric(10, 3) DEFAULT '1' NOT NULL,
  "unit" varchar(16) DEFAULT 'piece' NOT NULL,
  "real_status" varchar(16) DEFAULT 'offen' NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trip_items"
    ADD CONSTRAINT "shopping_trip_items_trip_id_shopping_trips_id_fk"
    FOREIGN KEY ("trip_id") REFERENCES "shopping_trips"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trip_items"
    ADD CONSTRAINT "shopping_trip_items_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trip_items"
    ADD CONSTRAINT "shopping_trip_items_shopping_list_item_id_shopping_list_items_id_fk"
    FOREIGN KEY ("shopping_list_item_id") REFERENCES "shopping_list_items"("id") ON DELETE CASCADE ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shopping_trip_items"
    ADD CONSTRAINT "shopping_trip_items_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- 1 Bedarf = hoechstens 1 Run-Position (Reservierung).
CREATE UNIQUE INDEX IF NOT EXISTS "shopping_trip_items_need_uniq"
  ON "shopping_trip_items" ("shopping_list_item_id");
