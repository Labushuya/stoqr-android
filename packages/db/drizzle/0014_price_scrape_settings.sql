-- Block G4: In-App-Schalter fuer Preis-Abruf + Rueckbau der Filiale/Region-Spalte
--
-- (1) expiry_config.price_scrape_enabled: household-weiter Ein/Aus-Schalter fuer den
--     Online-Preis-Abruf (ersetzt die Env-Variable PRICE_SCRAPE_ENABLED). Default AUS.
-- (2) stores.scrape_region (G2/0013) wird zurueckgebaut: die Abruf-URL traegt jetzt
--     einen {EAN}-Platzhalter in stores.scrape_url; eine separate Filiale/Region entfaellt.
-- Additiv/idempotent.

--> statement-breakpoint
ALTER TABLE "expiry_config"
  ADD COLUMN IF NOT EXISTS "price_scrape_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "stores"
  DROP COLUMN IF EXISTS "scrape_region";
