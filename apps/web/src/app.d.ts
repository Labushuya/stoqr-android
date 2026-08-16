import type { User, Session } from 'better-auth'

declare global {
  // Build-Target-Konstante (Vite `define`): 'node' (Pi) | 'app' (Android).
  // Muss INNERHALB von `declare global` stehen — app.d.ts ist durch die
  // import/export-Zeilen ein Modul, ein top-level `declare const` waere sonst
  // modul-lokal und global nicht sichtbar (TS2304 an den Nutzungsstellen).
  const __STOQR_TARGET__: 'node' | 'app'

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
