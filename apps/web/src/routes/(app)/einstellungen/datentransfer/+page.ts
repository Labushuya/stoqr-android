import type { PageLoad } from './$types'

// ---------------------------------------------------------------------------
// Universeller Load fuer Datentransfer.
// Die Seite ist rein aktionsgetrieben (Export/Import ueber /api/transfer/*), es
// gibt nichts vorzuladen. Beide Targets liefern ein leeres Objekt:
//   Pi:  +page.server.ts (Auth-Gate) bleibt Quelle.
//   App: kein Login/kein Server-Load -> leeres Objekt genuegt.
// ---------------------------------------------------------------------------

export const load: PageLoad = async () => {
  return {}
}
