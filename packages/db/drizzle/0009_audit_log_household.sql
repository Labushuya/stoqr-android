-- Block D: Audit-Log um household_id erweitern
--
-- Ermoeglicht haushalts-gescopte Aktivitaets-Ansicht. Nullable (Alt-Zeilen
-- ohne Zuordnung bleiben gueltig; kuenftige Mutationen setzen household_id).
-- FK mit ON DELETE CASCADE, damit Log eines geloeschten Haushalts mitgeht.

ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "household_id" text;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "audit_log"
    ADD CONSTRAINT "audit_log_household_id_households_id_fk"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Index fuer die chronologische Aktivitaets-Abfrage je Haushalt.
CREATE INDEX IF NOT EXISTS "audit_log_household_created_idx"
  ON "audit_log" ("household_id", "created_at" DESC);
