-- Step 1: Create default household from first registered user
DO $$
DECLARE
  first_user_id text;
BEGIN
  SELECT id INTO first_user_id FROM "users" ORDER BY "created_at" ASC LIMIT 1;
  IF first_user_id IS NOT NULL THEN
    INSERT INTO "households" ("id", "name", "created_by")
    VALUES ('household_default', 'Mein Haushalt', first_user_id)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
--> statement-breakpoint
-- Step 2: Add all existing users as admins of the default household
INSERT INTO "household_members" ("household_id", "user_id", "role")
SELECT 'household_default', "id", 'admin'
FROM "users"
WHERE EXISTS (SELECT 1 FROM "households" WHERE "id" = 'household_default')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Step 3: Add household_id as NULLABLE to all Fachtabellen
ALTER TABLE "locations"           ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "stores"              ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "inventory_items"     ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "expiry_config"       ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "stock_targets"       ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "product_stores"      ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "shopping_list_items" ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
ALTER TABLE "bring_sync_log"      ADD COLUMN IF NOT EXISTS "household_id" text REFERENCES "households"("id");
--> statement-breakpoint
-- Step 4: Backfill all rows with the default household (only if household exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "households" WHERE "id" = 'household_default') THEN
    UPDATE "locations"           SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "stores"              SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "inventory_items"     SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "expiry_config"       SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "stock_targets"       SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "product_stores"      SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "shopping_list_items" SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
    UPDATE "bring_sync_log"      SET "household_id" = 'household_default' WHERE "household_id" IS NULL;
  END IF;
END $$;
--> statement-breakpoint
-- Step 5: Make household_id NOT NULL (only safe after backfill)
ALTER TABLE "locations"           ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "stores"              ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "inventory_items"     ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "expiry_config"       ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "stock_targets"       ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "product_stores"      ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "shopping_list_items" ALTER COLUMN "household_id" SET NOT NULL;
ALTER TABLE "bring_sync_log"      ALTER COLUMN "household_id" SET NOT NULL;
--> statement-breakpoint
-- Step 6: Drop old user_id columns from Fachtabellen
ALTER TABLE "locations"           DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "stores"              DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "inventory_items"     DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "expiry_config"       DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "stock_targets"       DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "product_stores"      DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "shopping_list_items" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "bring_sync_log"      DROP COLUMN IF EXISTS "user_id";
--> statement-breakpoint
-- Step 7: Fix expiry_config unique constraint
ALTER TABLE "expiry_config" DROP CONSTRAINT IF EXISTS "expiry_config_user_id_unique";
ALTER TABLE "expiry_config" DROP CONSTRAINT IF EXISTS "expiry_config_household_id_unique";
ALTER TABLE "expiry_config" ADD CONSTRAINT "expiry_config_household_id_unique" UNIQUE("household_id");
--> statement-breakpoint
-- Step 8: Fix stock_targets unique index
DROP INDEX IF EXISTS "stock_targets_user_product_uniq";
DROP INDEX IF EXISTS "stock_targets_household_product_uniq";
CREATE UNIQUE INDEX "stock_targets_household_product_uniq" ON "stock_targets"("household_id", "product_id");
--> statement-breakpoint
-- Step 9: product_stores — replace priority with sort_order, fix unique index
ALTER TABLE "product_stores" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 1 NOT NULL;
ALTER TABLE "product_stores" DROP COLUMN IF EXISTS "priority";
DROP INDEX IF EXISTS "product_stores_product_store_user_uniq";
DROP INDEX IF EXISTS "product_stores_product_store_household_uniq";
CREATE UNIQUE INDEX "product_stores_product_store_household_uniq"
  ON "product_stores"("product_id", "store_id", "household_id");
