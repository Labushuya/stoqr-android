ALTER TABLE "users" ALTER COLUMN "username" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "display_name" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;
