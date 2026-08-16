-- Block G8-4: Volltext-Beschleunigung fuer die Katalog-Suche (globus_snapshots.name)
--
-- pg_trgm + GIN-Index fuer schnelle ILIKE-Suche auf name. Failsafe: schlaegt die
-- Extension mangels Rechten fehl, wird sie uebersprungen (die ILIKE-Suche
-- funktioniert dann ohne Index — bei kleinem Katalog vertretbar). Additiv.

--> statement-breakpoint
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_trgm konnte nicht erstellt werden (%). Katalog-Suche laeuft ohne GIN-Index.', SQLERRM;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "globus_snapshots_name_trgm"
    ON "globus_snapshots" USING gin ("name" gin_trgm_ops);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'GIN-Index globus_snapshots_name_trgm uebersprungen (%).', SQLERRM;
END $$;
