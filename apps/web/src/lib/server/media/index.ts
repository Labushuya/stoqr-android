// ---------------------------------------------------------------------------
// Media-Storage (server-only) — Block G7.
//
// Laedt Produktbilder (Globus-Katalog) in ein persistentes Verzeichnis (MEDIA_DIR,
// Docker-Volume) und liefert relative Pfade fuer die DB. Failsafe: jeder Fehler
// beim Download -> null (der Snapshot bleibt ohne localImagePath). resolveMediaPath
// schuetzt vor Path-Traversal (reine, testbare Funktion).
// ---------------------------------------------------------------------------

import { env } from '$env/dynamic/private'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveMediaPath } from '$lib/utils/media-path'

export { resolveMediaPath }

const TIMEOUT_MS = 8000
const MAX_BYTES = 2 * 1024 * 1024 // 2 MB
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; stoqr-media/0.1; +https://github.com/Labushuya/stoqr)'

export function mediaDir(): string {
  return env.MEDIA_DIR || '/data/media'
}

// Content-Type → Dateiendung (Whitelist).
const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

function extFromContentType(ct: string | null): string | null {
  if (!ct) return null
  const type = ct.split(';')[0].trim().toLowerCase()
  return EXT_BY_TYPE[type] ?? null
}

/**
 * Laedt ein Bild herunter und speichert es unter {householdId}/{gtin}.{ext}.
 * Liefert den relativen Pfad (fuer DB) oder null bei jedem Problem (Timeout,
 * Nicht-Bild, zu gross, Schreibfehler). Wirft nie.
 */
export async function downloadCatalogImage(
  householdId: string,
  gtin: string,
  remoteUrl: string | null | undefined
): Promise<string | null> {
  if (!remoteUrl || !householdId || !gtin) return null
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(remoteUrl, {
      signal: ctrl.signal,
      headers: { 'User-Agent': env.PRICE_SCRAPE_USER_AGENT || DEFAULT_USER_AGENT },
    })
    if (!res.ok) return null
    const ext = extFromContentType(res.headers.get('content-type'))
    if (!ext) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return null

    const relDir = householdId
    const rel = `${relDir}/${gtin}.${ext}`
    const dirAbs = resolveMediaPath(relDir, mediaDir())
    const fileAbs = resolveMediaPath(rel, mediaDir())
    if (!dirAbs || !fileAbs) return null

    await mkdir(dirAbs, { recursive: true })
    // Atomar: temp schreiben + umbenennen.
    const tmp = join(dirAbs, `.${gtin}.${ext}.tmp`)
    await writeFile(tmp, buf)
    await rename(tmp, fileAbs)
    return rel
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}
