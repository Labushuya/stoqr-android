import type { User, Session } from 'better-auth'

declare global {
  // Build-Target-Konstante (Vite `define`): 'node' (Pi) | 'app' (Android).
  // Muss INNERHALB von `declare global` stehen — app.d.ts ist durch die
  // import/export-Zeilen ein Modul, ein top-level `declare const` waere sonst
  // modul-lokal und global nicht sichtbar (TS2304 an den Nutzungsstellen).
  const __STOQR_TARGET__: 'node' | 'app'
  // App-Version (Vite `define`, aus package.json). Fuer die Versions-Pill.
  const __STOQR_VERSION__: string

  namespace App {
    interface Locals {
      user: User | null
      session: Session | null
    }
    interface PageData {
      user: User | null
    }
  }
}

export {}
