import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getFieldSources, getProductById, clearFieldSource, type ProductField } from '$lib/server/queries/products'

// ---------------------------------------------------------------------------
// GET /api/products/[id]/sources — Feld-Herkunft je Stammdaten-Feld (G16/G17).
// Liefert { sources: {name?,brand?,image?,category?,unit?}, category } —
// zusaetzlich das aufgeloeste Kategorie-Objekt, damit die easy-add-Anzeige den
// Kategorie-WERT (nicht nur die Herkunft) zeigen kann, auch nach Barcode-Scan.
//
// DELETE /api/products/[id]/sources?field=<feld> — entfernt die Herkunft eines
// Feldes (G32): Wert bleibt, Herkunft → 'nicht erfasst'; manueller Schutz faellt
// weg, Mapping-Regeln greifen wieder.
// ---------------------------------------------------------------------------

const FIELDS: ProductField[] = ['name', 'brand', 'image', 'category', 'unit']

export const GET: RequestHandler = async ({ locals, params }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const [sources, product] = await Promise.all([
    getFieldSources(params.id),
    getProductById(params.id),
  ])
  const category = product?.category
    ? { id: product.category.id, name: product.category.name, icon: product.category.icon, slug: product.category.slug }
    : null
  return json({ sources, category })
}

export const DELETE: RequestHandler = async ({ locals, params, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })
  const field = url.searchParams.get('field') as ProductField | null
  if (!field || !FIELDS.includes(field)) {
    return json({ error: 'Ungültiges Feld' }, { status: 400 })
  }
  await clearFieldSource(params.id, field)
  return new Response(null, { status: 204 })
}

