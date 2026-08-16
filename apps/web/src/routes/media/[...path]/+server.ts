import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { requireHouseholdId } from '$lib/server/queries/households'
import { resolveMediaPath, mediaDir, downloadCatalogImage } from '$lib/server/media'
import { getDb } from '$lib/server/db'
import { globusSnapshots } from '@stoqr/db'
import { and, eq, desc, isNotNull } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'

// ---------------------------------------------------------------------------
// GET /media/[...path] — liefert lokal gesicherte Katalog-Bilder (G7).
//
// Auth + Household-Scope: der Pfad MUSS mit der eigenen householdId beginnen.
// Path-Traversal wird durch resolveMediaPath verhindert.
// Selbstheilung (G18-3): fehlt die Datei (z.B. nach Volume-Verlust/Update), wird
// EINMALIG on-demand aus dem neuesten Snapshot-imageRemoteUrl derselben EAN neu
// geladen — sonst blieben Alt-Referenzen dauerhaft 404, da der Sync sie nie neu holt.
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function serveFile(data: Uint8Array, abs: string): Response {
  const type = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream'
  return new Response(data as BodyInit, {
    headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' },
  })
}

export const GET: RequestHandler = async ({ locals, params }) => {
  const db = getDb()
  if (!locals.user) throw error(401, 'Unauthorized')
  const householdId = await requireHouseholdId(locals.user.id)

  const rel = params.path ?? ''
  // Nur Bilder des eigenen Haushalts (Pfad beginnt mit householdId/).
  if (!rel.startsWith(`${householdId}/`)) throw error(403, 'Forbidden')

  const abs = resolveMediaPath(rel, mediaDir())
  if (!abs) throw error(400, 'Bad path')

  try {
    return serveFile(new Uint8Array(await readFile(abs)), abs)
  } catch {
    // Datei fehlt → einmaliger On-demand-Reload aus dem neuesten Snapshot der EAN.
    // gtin = Dateiname ohne Endung (Schema {householdId}/{gtin}.{ext}).
    const gtin = basename(rel).replace(/\.[^.]+$/, '')
    if (/^\d{8,14}$/.test(gtin)) {
      try {
        const snap = await db.query.globusSnapshots.findFirst({
          where: (s: any) =>
            and(eq(s.gtin, gtin), eq(s.householdId, householdId), isNotNull(s.imageRemoteUrl)),
          orderBy: [desc(globusSnapshots.fetchedAt)],
          columns: { imageRemoteUrl: true },
        })
        if (snap?.imageRemoteUrl) {
          const reloaded = await downloadCatalogImage(householdId, gtin, snap.imageRemoteUrl)
          if (reloaded) {
            const reAbs = resolveMediaPath(reloaded, mediaDir())
            if (reAbs) return serveFile(new Uint8Array(await readFile(reAbs)), reAbs)
          }
        }
      } catch {
        // Reload fehlgeschlagen → normaler 404 unten.
      }
    }
    // 404 NICHT cachen, damit ein spaeterer Retry (nach Reload) nicht blockiert (G13-3).
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
