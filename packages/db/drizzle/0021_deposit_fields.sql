-- Block G47: Pfand / Leergut
--
-- Additive, idempotente Spalten (kein Backfill nötig, Defaults decken Bestand):
--  * products.has_deposit  — Artikel bedarf Pfand (Checkbox).
--  * products.deposit_ct   — Pfandbetrag in Cent (nullable; nur wenn bekannt).
--  * product_prices.price_includes_deposit — true = Preis enthält das Pfand bereits
--    (dann nicht zusätzlich addieren); false = zzgl. Pfand.

--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "has_deposit" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "deposit_ct" integer;
--> statement-breakpoint
ALTER TABLE "product_prices" ADD COLUMN IF NOT EXISTS "price_includes_deposit" boolean DEFAULT false NOT NULL;
