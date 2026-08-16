-- Inkrement 2a: Einheiten-Umrechnungsschicht
--
-- Ergaenzt units um dimension + to_base_factor, damit Bestaende sinnvoll
-- aggregiert werden koennen (g<->kg, ml<->l normalisiert; count-artige Einheiten
-- wie Stueck/Packung bleiben eigenstaendig, factor 1).

--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "dimension" varchar(8) DEFAULT 'count' NOT NULL;
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "to_base_factor" numeric(12,4) DEFAULT '1' NOT NULL;
--> statement-breakpoint
-- Backfill der System-Units. WHERE auf symbol + is_system, damit Custom-Units
-- eines Haushalts mit kollidierendem symbol NICHT ueberschrieben werden.
UPDATE "units" SET "dimension" = 'mass',   "to_base_factor" = '1'    WHERE "symbol" = 'g'  AND "is_system" = true;
--> statement-breakpoint
UPDATE "units" SET "dimension" = 'mass',   "to_base_factor" = '1000' WHERE "symbol" = 'kg' AND "is_system" = true;
--> statement-breakpoint
UPDATE "units" SET "dimension" = 'volume', "to_base_factor" = '1'    WHERE "symbol" = 'ml' AND "is_system" = true;
--> statement-breakpoint
UPDATE "units" SET "dimension" = 'volume', "to_base_factor" = '1000' WHERE "symbol" = 'l'  AND "is_system" = true;
-- 'piece','Packung','Dose','Flasche','Tetrapak' bleiben count/1 (Default).
