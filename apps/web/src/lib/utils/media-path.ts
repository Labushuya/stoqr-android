// ---------------------------------------------------------------------------
// Media-Pfad-Aufloesung (reine Funktion, testbar) — Block G7.
// Schuetzt vor Path-Traversal: der aufgeloeste Pfad muss innerhalb von baseDir
// liegen. Kein I/O, keine env-Abhaengigkeit.
// ---------------------------------------------------------------------------

import { resolve, sep } from 'node:path'

/** Loest rel sicher innerhalb baseDir auf; null bei Traversal/ungueltig. */
export function resolveMediaPath(rel: string, baseDir: string): string | null {
  if (typeof rel !== 'string' || rel.trim() === '') return null
  if (rel.includes('\0')) return null
  const base = resolve(baseDir)
  const full = resolve(base, rel)
  if (full !== base && !full.startsWith(base + sep)) return null
  return full
}
