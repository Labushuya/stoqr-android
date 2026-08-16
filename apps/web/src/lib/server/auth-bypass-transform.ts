import type { User, Session } from 'better-auth'

// Reine Bypass-Transformationen — bewusst OHNE Import von `$lib/server/db`, damit
// diese Logik in Vitest ohne SvelteKit-Alias/DB unit-testbar ist.

// Minimaler Ausschnitt der users-Zeile, den wir für die Bypass-Identität brauchen.
export type BypassUserRow = {
  id: string
  displayName: string | null
  email: string | null
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * users-Zeile → Better-Auth `User` (name = displayName, mit Fallbacks).
 */
export function rowToBypassUser(row: BypassUserRow): User {
  return {
    id: row.id,
    name: row.displayName ?? row.email ?? row.id,
    email: row.email ?? '',
    emailVerified: row.emailVerified,
    image: row.image ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  } as User
}

/**
 * Minimales, typkonformes Session-Objekt für den Bypass. `locals.session` wird
 * aktuell nirgends gelesen, soll aber nicht `null` sein, wenn ein Nutzer da ist.
 */
export function makeBypassSession(user: User): Session {
  const now = new Date()
  const farFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  return {
    id: 'bypass',
    token: 'bypass',
    userId: user.id,
    expiresAt: farFuture,
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  } as Session
}
