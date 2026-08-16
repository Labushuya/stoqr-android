-- Migration: add city column to stores table
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "city" varchar(128);
