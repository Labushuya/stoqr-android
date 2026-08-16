import { auth } from '$lib/server/auth'
import { AUTH_DISABLED, getBypassUser, makeBypassSession } from '$lib/server/auth-bypass'
import type { Handle } from '@sveltejs/kit'

export const handle: Handle = async ({ event, resolve }) => {
  // App-Target (STOQR_TARGET=app): Es gibt keinen Server zur Laufzeit — die
  // SPA laeuft komplett im WebView gegen On-Device-SQLite. Dieser Hook wird
  // dort nur EINMAL beim Build gerufen: adapter-static rendert die Fallback-
  // Seite (/[fallback]) und faehrt dabei handle() an. Ohne diesen Guard wuerde
  // getBypassUser()/auth.api.getSession() eine Postgres-Verbindung anstossen
  // (kein DATABASE_URL im App-Build) und der Fallback-Render mit 500 brechen.
  // Wir kurzschliessen daher ohne jeden DB-Zugriff — die echte lokale Identitaet
  // liefert im App-Target die universelle +layout.ts.
  if (__STOQR_TARGET__ === 'app') {
    event.locals.user = null
    event.locals.session = null
    return resolve(event)
  }

  // Login deaktiviert (AUTH_DISABLED=true): feste Default-Identität injizieren,
  // statt eine Better-Auth-Session zu lesen. Existiert noch kein Nutzer (frische DB),
  // fällt der Ablauf bewusst auf den normalen Login-Pfad zurück, damit die
  // Erst-Registrierung via /register möglich bleibt.
  if (AUTH_DISABLED) {
    const user = await getBypassUser()
    if (user) {
      event.locals.user = user
      event.locals.session = makeBypassSession(user)
      return resolve(event)
    }
  }

  const session = await auth.api.getSession({
    headers: event.request.headers,
  })
  event.locals.user = session?.user ?? null
  event.locals.session = session?.session ?? null
  return resolve(event)
}
