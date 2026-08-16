// ---------------------------------------------------------------------------
// apiFetch — Client-Datenzugriff (Dual-Target)
// ---------------------------------------------------------------------------
// Einheitlicher Ersatz fuer `fetch('/api/...')` in den Komponenten. Der
// Response-Vertrag ist identisch zu fetch: res.ok / res.json() / res.text()
// funktionieren unveraendert. So werden die Aufrufstellen nur umbenannt
// (fetch -> apiFetch), nicht umgeschrieben.
//
// Pi (STOQR_TARGET=node): delegiert 1:1 an das globale fetch (SSR + Endpoints).
// App (STOQR_TARGET=app): kein Netz/kein Server — der App-Router fuehrt die
// Anfrage lokal gegen die On-Device-SQLite aus (ueber die entkoppelten
// Query-Funktionen) und liefert ein synthetisches Response zurueck.
//
// Der ungenutzte Zweig wird per Vite `define`/DCE entfernt: im Pi-Bundle
// landet KEIN SQLite-/Query-Code, im App-Bundle kein toter fetch-Pfad.

/** Signaturgleich zu fetch, damit die Aufrufstellen 1:1 umbenannt werden. */
export async function apiFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  if (__STOQR_TARGET__ === 'app') {
    // Lazy-Import: der App-Router (samt SQLite/Query-Code) wird nur im
    // App-Bundle eingezogen.
    const { routeApp } = await import('./api-router.app')
    return routeApp(typeof input === 'string' ? input : input.toString(), init)
  }
  // Pi: normaler HTTP-Weg an die SvelteKit-Endpoints.
  return fetch(input, init)
}
