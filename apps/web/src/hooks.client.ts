// ---------------------------------------------------------------------------
// hooks.client — Client-Startup (Dual-Target)
// ---------------------------------------------------------------------------
// App-Target (STOQR_TARGET=app): initialisiert die On-Device-SQLite BEVOR die
// App rendert bzw. bevor je ein routeApp()/apiFetch() eine Query faehrt. Der
// `init`-Hook wird von SvelteKit einmalig beim App-Start im Browser awaited,
// noch vor den ersten load()-Funktionen — so ist setDb() garantiert gesetzt,
// bevor der App-Router die DB nutzt.
//
// Pi-Target (STOQR_TARGET=node): No-Op. Der ungenutzte Zweig (samt lazy-
// importiertem boot.app + nativem Capacitor-Code) wird per Vite `define`/DCE
// entfernt, sodass der Pi-Bundle keinen nativen Code zieht.

import type { ClientInit } from '@sveltejs/kit'

export const init: ClientInit = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // Lazy-Import: boot.app (samt @capacitor-community/sqlite) landet nur im
    // App-Bundle.
    const { bootApp } = await import('./lib/client/boot.app')
    await bootApp()
  }
}
