import { getDb } from '$lib/server/db'
import { asc } from 'drizzle-orm'
import type { User } from 'better-auth'
import { rowToBypassUser, makeBypassSession, type BypassUserRow } from './auth-bypass-transform'

/**
 * Auth-Bypass — Login vollständig deaktivierbar per ENV-Flag.
 *
 * Ist AUTH_DISABLED=true gesetzt, injiziert der Hook (hooks.server.ts) eine feste
 * Default-Identität statt eine Better-Auth-Session zu lesen. Damit passieren alle
 * `if (!locals.user)`-Guards, die App-Shell rendert und `requireHouseholdId(userId)`
 * löst normal auf — vorausgesetzt, mindestens ein Nutzer existiert in der DB
 * (auf dem Pi der Fall). Kein Code, kein Schema, keine Query wird sonst angefasst.
 *
 * Reversibel: Flag entfernen → Login-Verhalten exakt wie zuvor.
 */
export const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true'

export { rowToBypassUser, makeBypassSession }

// Prozessweiter Cache: der Default-Nutzer wird höchstens einmal aus der DB gelesen.
// `undefined` = noch nicht geladen, `null` = geladen, aber kein Nutzer vorhanden.
let cachedUser: User | null | undefined = undefined

/**
 * Liest den ersten (ältesten) existierenden Nutzer als Default-Identität.
 * Gibt `null` zurück, wenn kein Nutzer existiert (frische DB) oder die Abfrage
 * fehlschlägt — dann fällt der Hook auf den normalen Login-Pfad zurück, damit man
 * sich weder aussperrt noch bei einem DB-Hänger einen harten 500 bekommt.
 */
export async function getBypassUser(): Promise<User | null> {
  const db = getDb()
  if (cachedUser !== undefined) return cachedUser

  try {
    const row = await db.query.users.findFirst({
      orderBy: (u: any) => [asc(u.createdAt)],
    })
    cachedUser = row ? rowToBypassUser(row as BypassUserRow) : null
  } catch (err) {
    // DB (noch) nicht erreichbar o.ä. — nicht cachen, damit ein späterer Request
    // es erneut versucht; für diesen Request auf Login-Pfad zurückfallen.
    console.error('[auth-bypass] getBypassUser konnte keinen Nutzer laden:', err)
    return null
  }

  return cachedUser
}
