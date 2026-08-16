-- Block G2: Globus-Filiale/Region am Markt fuer die Barcode-Search-URL
--
-- stores.scrape_region traegt die Globus-Filiale (z.B. "hockenheim"). Die Abruf-URL
-- wird kuenftig aus scrape_region + products.gtin gebaut:
--   https://produkte.globus.de/<region>/search?query=<gtin>
-- Das bestehende scrape_url (F2) bleibt als manueller Override erhalten.
-- Additiv, keine Alt-Daten betroffen.

--> statement-breakpoint
ALTER TABLE "stores"
  ADD COLUMN IF NOT EXISTS "scrape_region" varchar(64);
