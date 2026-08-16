CREATE TABLE "households" (
  "id" text PRIMARY KEY NOT NULL,
  "name" varchar(128) NOT NULL,
  "created_by" text REFERENCES "users"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "user_id" text NOT NULL,
  "role" varchar(16) DEFAULT 'member' NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "household_members_household_user_uniq" UNIQUE("household_id", "user_id"),
  CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE "invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text NOT NULL,
  "email" varchar(255) NOT NULL,
  "token" text NOT NULL UNIQUE,
  "created_by" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  CONSTRAINT "invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE,
  CONSTRAINT "invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);
--> statement-breakpoint
CREATE TABLE "units" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "household_id" text,
  "name" varchar(32) NOT NULL,
  "symbol" varchar(8) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  CONSTRAINT "units_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO "units" ("name", "symbol", "sort_order", "is_system") VALUES
  ('Stück', 'piece', 1, true),
  ('Gramm', 'g', 2, true),
  ('Kilogramm', 'kg', 3, true),
  ('Milliliter', 'ml', 4, true),
  ('Liter', 'l', 5, true),
  ('Packung', 'Packung', 6, true),
  ('Dose', 'Dose', 7, true),
  ('Flasche', 'Flasche', 8, true),
  ('Tetrapak', 'Tetrapak', 9, true);
