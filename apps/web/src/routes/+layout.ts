// ---------------------------------------------------------------------------
// +layout.ts — universelle Layout-Load (Dual-Target)
// ---------------------------------------------------------------------------
// App-Target (STOQR_TARGET=app): kein SSR, daher liefert +layout.server.ts
// nichts aus. Diese universelle Load stellt die Layout-Daten bereit, die
// +layout.svelte liest (data.user.name || data.user.email; data.authDisabled):
// eine synthetische lokale Identitaet + authDisabled=true.
//
// Zusaetzlich wird hier bootApp() awaited: die On-Device-DB ist damit
// spaetestens vor dem ersten Render initialisiert (setDb() gesetzt), auch wenn
// die installierte SvelteKit-Version den `init`-Client-Hook noch nicht kennt.
// bootApp() ist idempotent -> doppelter Aufruf (init + hier) ist unkritisch.
//
// Pi-Target (STOQR_TARGET=node): reicht die Server-Daten (+layout.server.ts)
// unveraendert durch. SvelteKit merged parent-Server-Daten mit dem Rueckgabe-
// Objekt der universellen Load; ein leeres {} laesst die Server-Daten intakt.

import type { LayoutLoad } from './$types'

// Im App-Target darf kein SSR laufen — SPA-only.
export const ssr = __STOQR_TARGET__ !== 'app'

export const load: LayoutLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // On-Device-DB sicher hochgefahren haben, bevor Kind-Loads/Komponenten
    // ueber apiFetch -> routeApp -> getDb() zugreifen.
    const { bootApp } = await import('$lib/client/boot.app')
    await bootApp()

    return {
      user: { id: 'local-user', name: 'Lokal', email: null },
      authDisabled: true,
    }
  }

  // Pi: Server-Daten unveraendert durchreichen.
  return {}
}
