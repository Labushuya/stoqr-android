-- Block F2: Online-Preis-Abruf + Staging/Freigabe
--
-- Erweitert product_prices um einen Freigabe-Status (Staging): abgerufene Online-Preise
-- landen als 'proposed' und werden nie is_current, bis der User sie bestaetigt ('confirmed')
-- oder verwirft ('rejected'). Kern-Invariante: status != 'confirmed' => is_current = false.
-- stores.scrape_url traegt die optionale Produkt-/Regions-URL fuer den Abruf.
-- Additiv/idempotent: Bestandszeilen werden via DEFAULT 'confirmed' gebackfillt.

--> statement-breakpoint
ALTER TABLE "product_prices"
  ADD COLUMN IF NOT EXISTS "status" varchar(16) DEFAULT 'confirmed' NOT NULL;
--> statement-breakpoint
-- Defensiv, falls die Spalte zuvor nullable angelegt worden sein sollte.
UPDATE "product_prices" SET "status" = 'confirmed' WHERE "status" IS NULL;
--> statement-breakpoint
-- Max. 1 offener Vorschlag je Artikel+Markt+Haushalt (verhindert Vorschlags-Flut).
CREATE UNIQUE INDEX IF NOT EXISTS "product_prices_proposed_uniq"
  ON "product_prices" ("product_id", "store_id", "household_id") WHERE "status" = 'proposed';
--> statement-breakpoint
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "scrape_url" text;
