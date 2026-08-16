// ---------------------------------------------------------------------------
// Postgres-Client-Stub (App-Target / Browser)
// ---------------------------------------------------------------------------
// Auf dem App-Target (STOQR_TARGET=app, adapter-static) wird '@stoqr/db/client'
// per Vite-Alias durch dieses Modul ersetzt. Grund: das echte client.ts ruft
// beim Import postgres(connectionString) auf und zieht den nativen
// 'postgres'-Treiber (perf_hooks/node:stream) mit — im Browser/WebView nicht
// ladbar.
//
// Die App nutzt NIE die Postgres-Instanz: getDb() liefert dort die via setDb()
// injizierte On-Device-SQLite-Instanz. Dieser Stub existiert nur, damit der
// statische Import in $data/db.ts aufloest. Wird `db` wider Erwarten doch
// angefasst (also setDb() lief nicht), meldet der Proxy klar den Boot-Fehler,
// statt still Unsinn zu tun.

const boom = () => {
  throw new Error(
    '[stoqr] Postgres-Client im App-Target aufgerufen — setDb() (Boot) hat die ' +
      'On-Device-SQLite nicht gesetzt. Das ist ein Boot-Reihenfolge-Fehler.',
  )
}

// Proxy statt echtem Objekt: jeder Property-Zugriff/Aufruf wirft.
export const db = new Proxy(
  {},
  {
    get: boom,
    apply: boom,
  },
) as unknown as typeof import('./client').db

export type Database = import('./client').Database
