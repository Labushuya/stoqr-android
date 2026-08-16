-- Block G44: Reichere Globus-Daten (Stufe 1) — Grundpreis + Rohdaten-Archiv
--
-- Additive, idempotente Spalten (kein Backfill, alle nullable):
--  * product_prices.base_price_ct / base_price_unit — gesetzlicher Grundpreis
--    (PAngV, z.B. 19 Cent / 'l') aus dem Globus-Suggest-HTML (reference-price).
--  * globus_snapshots.raw_detail_html — vollstaendiges Detailseiten-HTML (Roh-Archiv),
--    damit kuenftig weitere Felder nachtraeglich erschliessbar sind.
--  * globus_snapshots.extracted — strukturierte Feld-Landkarte des Abrufs
--    ({ field, value, source, belongsTo }[]): dokumentiert, welcher Wert woher kam.

--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN IF NOT EXISTS "base_price_ct" integer;
--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN IF NOT EXISTS "base_price_unit" varchar(16);
--> statement-breakpoint
ALTER TABLE "globus_snapshots" ADD COLUMN IF NOT EXISTS "raw_detail_html" text;
--> statement-breakpoint
ALTER TABLE "globus_snapshots" ADD COLUMN IF NOT EXISTS "extracted" jsonb;
