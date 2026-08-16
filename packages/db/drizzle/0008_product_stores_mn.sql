-- Inkrement M1: Markt am Artikel (M:N)
--
-- product_stores neu — schlank. In Migration 0005 wurde die alte (ueberladene)
-- product_stores-Tabelle (Bezugsquellen mit sort_order) entfernt. Hier kommt sie
-- in klarer Rolle zurueck: reine Zuordnung "welcher Artikel ist bei welchem Markt
-- einkaufbar" (Planung). Der Herkunfts-Markt eines Bestands bleibt an
-- inventory_items.store_id; Preise kommen spaeter in product_prices.

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_stores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product_id" uuid NOT NULL,
  "store_id" uuid NOT NULL,
  "household_id" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "product_stores_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE,
  CONSTRAINT "product_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE,
  CONSTRAINT "product_stores_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_stores_product_store_household_uniq" ON "product_stores" ("product_id","store_id","household_id");
