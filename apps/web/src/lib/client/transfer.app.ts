// ---------------------------------------------------------------------------
// transfer.app — App-only File-IO fuer Import/Export (Capacitor)
// ---------------------------------------------------------------------------
// Nur im App-Target importiert (lazy, aus der datentransfer-Seite). Kapselt die
// nativen Capacitor-Plugins (@capacitor/filesystem, @capacitor/share), damit der
// Pi-Bundle sie nie zieht (DCE, gleiches Muster wie boot.app.ts).
//
// Der eigentliche Daten-Ein/Ausgang laeuft ueber apiFetch('/api/transfer/...'),
// das im App-Target auf routeApp() faellt (kein Netz). Diese Datei macht nur:
//   - exportToFile: Envelope-Text vom Router holen -> Datei schreiben -> teilen
//   - der Import liest die Datei in der UI via <input type=file> + File.text()
//     und ruft dann importFromText() (kein nativer Dep noetig).

import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { apiFetch } from '$lib/client/api'
import type { ExportTier } from '@stoqr/db/sqlite'

export interface ExportResult {
  scope: ExportTier
  filename: string
  uri: string
  shared: boolean
}

/**
 * Exportiert den gewaehlten Tier: holt den Envelope-Text vom App-Router, schreibt
 * ihn als .stoqr-Datei ins Cache-Verzeichnis und oeffnet den nativen Teilen-Dialog
 * (Drive/Mail/…). Ein abgebrochenes Teilen ist KEIN Fehler — die Datei ist bereits
 * geschrieben; dann shared:false. Wirft nur, wenn Export/Schreiben selbst scheitert.
 */
export async function exportToFile(scope: ExportTier): Promise<ExportResult> {
  const res = await apiFetch(`/api/transfer/export?scope=${encodeURIComponent(scope)}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error ?? `Export fehlgeschlagen (${res.status})`)
  }
  const { file, exportedAt } = (await res.json()) as { file: string; exportedAt: string }
  const stamp = (exportedAt || new Date().toISOString()).slice(0, 10)
  const filename = `stoqr-${scope}-${stamp}.stoqr`

  // In den Cache schreiben (kein Storage-Permission noetig) und teilen.
  const written = await Filesystem.writeFile({
    path: filename,
    data: file,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  })

  // Teilen ist optional: der Nutzer kann den Dialog abbrechen (Share wirft dann),
  // oder auf manchen Geraeten fehlt ein Ziel. Die Datei liegt bereits im Cache —
  // das darf den Export nicht als Fehler markieren.
  let shared = false
  try {
    await Share.share({
      title: 'stoqr-Export',
      text: `stoqr-Export (${scope})`,
      url: written.uri,
      dialogTitle: 'stoqr-Datei teilen',
    })
    shared = true
  } catch {
    shared = false
  }

  return { scope, filename, uri: written.uri, shared }
}

export interface ImportResult {
  scope: string
  sourceSystem: string
  inserted: Record<string, number>
  reusedProducts: number
  warnings: string[]
}

/**
 * Importiert (REPLACE) den Inhalt einer zuvor eingelesenen .stoqr-Datei. Der
 * Aufrufer liest die Datei via <input type=file> + File.text() und uebergibt den
 * Rohtext. confirm muss true sein (destruktiv). Wirft bei Fehler.
 */
export async function importFromText(fileText: string): Promise<ImportResult> {
  const res = await apiFetch('/api/transfer/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: true, file: fileText }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body?.error ?? `Import fehlgeschlagen (${res.status})`)
  }
  return body as ImportResult
}
