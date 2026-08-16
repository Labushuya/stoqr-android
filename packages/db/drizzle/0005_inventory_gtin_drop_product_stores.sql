-- Inkrement 1: Kanonisches Datenmodell — EAN ans Bestand, product_stores entfernen
--
-- Entscheidungen (2026-07-11, siehe docs/ROADMAP.md):
--   * Universeller Master-Artikel: EAN + Markt leben am Bestand (inventory_items),
--     nicht am Artikel (products).
--   * products.gtin BLEIBT bestehen — aber ausschliesslich als interner
--     Open-Food-Facts Cache-Schluessel (Barcode -> Naehrwerte/Name). Nicht im UI.
--   * product_stores (M:N Artikel<->Markt als Stammdaten) wird entfernt; der Markt
--     eines Artikels ergibt sich aus den tatsaechlichen Bestaenden.
--
-- Testdaten-Reset: Bestehende Bestaende (inventory_items) sind Testdaten und werden
-- geleert, da sich das Bestand-Modell aendert (neue EAN-Spalte, Markt jetzt fuehrend).
-- Artikel-Stammdaten (products), Orte, Maerkte bleiben erhalten.

--> statement-breakpoint
-- 1. Neue Spalte: EAN am Bestand (die konkrete EAN dieses physischen Bestands)
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "gtin" varchar(14);

--> statement-breakpoint
-- 2. Testdaten-Reset der Bestaende (Modellwechsel)
DELETE FROM "inventory_items";

--> statement-breakpoint
-- 3. product_stores entfernen (Markt liegt jetzt am Bestand)
DROP TABLE IF EXISTS "product_stores";
