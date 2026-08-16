import type { CapacitorConfig } from '@capacitor/cli'

// ---------------------------------------------------------------------------
// Capacitor-Konfiguration (Android-Huelle)
// ---------------------------------------------------------------------------
// Die WebView laedt das statische SPA-Bundle aus `build/` (erzeugt via
// `STOQR_TARGET=app pnpm --filter @stoqr/web build`, adapter-static).
// Daten kommen aus On-Device-SQLite (@capacitor-community/sqlite), nicht ueber
// Netz. androidScheme https, damit SQLite/Storage einen sicheren Origin haben.

const config: CapacitorConfig = {
  appId: 'de.c0demon.stoqr',
  appName: 'stoqr',
  webDir: 'build',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorSQLite: {
      // On-Device-DB (offline). Kein Netz, keine Cloud.
      androidIsEncryption: false,
    },
  },
}

export default config
