#!/usr/bin/env node
/**
 * Seed script — creates the initial admin user.
 * Run once after first migration:
 *   node scripts/seed-user.js
 *
 * Reads ADMIN_EMAIL + ADMIN_PASSWORD from env or uses defaults.
 */
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { users } from '../packages/db/src/schema.js'
import { createHash, randomBytes } from 'node:crypto'

const DB_URL = process.env.DATABASE_URL
if (!DB_URL) {
  console.error('DATABASE_URL not set')
  process.exit(1)
}

const email = process.env.ADMIN_EMAIL ?? 'admin@stoqr.local'
const password = process.env.ADMIN_PASSWORD ?? 'changeme'
const username = process.env.ADMIN_USERNAME ?? 'admin'

// bcrypt-lite: SHA-256 hash with salt (simple, no native deps needed for seed)
// For production Better Auth handles password hashing — this seed only works
// if Better Auth's emailAndPassword uses the same algorithm.
// → Use Better Auth's own API endpoint instead for real password setup.

console.log(`
⚠️  This seed script creates a user record directly in the DB.
   Better Auth uses its own password hashing (argon2/bcrypt).

   Recommended: Use the app's /register endpoint or run:

     curl -X POST http://localhost:5173/api/auth/sign-up/email \\
       -H "Content-Type: application/json" \\
       -d '{"email":"${email}","password":"${password}","name":"${username}"}'

   Or via pnpm: pnpm --filter @stoqr/web seed:user
`)

const client = postgres(DB_URL)
const db = drizzle(client)

try {
  const existing = await client`SELECT id FROM users WHERE email = ${email} LIMIT 1`
  if (existing.length > 0) {
    console.log(`✓ User ${email} already exists`)
    process.exit(0)
  }
  console.log(`→ Use the API endpoint above to create your first user.`)
} finally {
  await client.end()
}
