import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getDb } from '$lib/server/db'
import { betterAuthTables } from './auth-schema'

function createAuth() {
  const db = getDb()
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg',
      usePlural: true,
      schema: betterAuthTables,
    }),
    emailAndPassword: {
      enabled: true,
    },
    secret: process.env.BETTER_AUTH_SECRET ?? 'better-auth-secret-12345678901234567890',
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
    user: {
      fields: {
        name: 'displayName',
      },
    },
  })
}

let _auth: ReturnType<typeof createAuth> | null = null

export function getAuth() {
  if (!_auth) _auth = createAuth()
  return _auth
}

// Convenience proxy — behaves like the auth object but initialises lazily
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_, prop) {
    return getAuth()[prop as keyof ReturnType<typeof createAuth>]
  },
})

export type Session = ReturnType<typeof createAuth>['$Infer']['Session']
export type User = ReturnType<typeof createAuth>['$Infer']['Session']['user']
