-- Inkrement 1 (Teil 2): Notizen als Artikel-Stammdaten
--
-- Die ROADMAP nennt "notes" als Artikel-Feld. Die products-Tabelle hatte bisher
-- nur "description". Diese Migration ergaenzt eine eigene notes-Spalte, damit die
-- neue Artikelverwaltung (Einstellungen -> Artikel) Notizen als Stammdaten pflegen kann.

--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "notes" text;
