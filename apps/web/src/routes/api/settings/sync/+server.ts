import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// ---------------------------------------------------------------------------
// /api/settings/sync — Pi-Target (Phase-1-Stub)
// ---------------------------------------------------------------------------
// Der App-Target ruft diesen Pfad NICHT ueber Netz auf, sondern der App-Router
// bedient ihn lokal gegen die `meta`-Tabelle. Auf dem Pi existiert keine
// App-Sync-Konfiguration: GET liefert einen statischen Default (Pi ist dort
// per Definition das fuehrende System), POST ist ein bewusstes No-op, damit die
// gemeinsame UI-Komponente auf beiden Targets denselben Vertrag hat.
//
// Echter Sync-Netzcode folgt in Phase 2-4 (siehe Plan/Ausblick).

export const GET: RequestHandler = async () => {
  return json({ leader: 'pi', piUrl: '' })
}

export const POST: RequestHandler = async () => {
  // Bewusst wirkungslos in Phase 1 (kein Persistenz-Ziel auf dem Pi).
  return json({ ok: true, noop: true })
}
