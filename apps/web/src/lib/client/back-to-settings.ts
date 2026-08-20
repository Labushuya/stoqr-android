// ---------------------------------------------------------------------------
// backToSettings — Breadcrumb-Zurueck mit Scroll-Erhalt
// ---------------------------------------------------------------------------
// Ein normaler <a href="/einstellungen"> ist eine Vorwaerts-Navigation ->
// SvelteKit scrollt nach oben. Kam der Nutzer per Link von der Einstellungen-
// Uebersicht auf die Unterseite, ist die Uebersicht der vorige History-Eintrag;
// history.back() nutzt dann die eingebaute SvelteKit-Scroll-Wiederherstellung
// und landet an der vorigen Scroll-Position. Fallback: normale Navigation.

import { goto } from '$app/navigation'

export function backToSettings(e: MouseEvent) {
  // Nur linke Maustaste ohne Modifier abfangen (Rechtsklick/Neuer-Tab bleibt).
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  // Wenn es einen History-Eintrag gibt, per back() zurueck (Scroll-Restore);
  // sonst regulaer zur Uebersicht navigieren.
  if (typeof history !== 'undefined' && history.length > 1) {
    history.back()
  } else {
    void goto('/einstellungen')
  }
}
