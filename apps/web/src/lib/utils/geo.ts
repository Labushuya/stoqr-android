// ---------------------------------------------------------------------------
// Nominatim/OpenStreetMap-Ergebnis-Mapping (reine Funktion, testbar) — Block G2.
//
// Wandelt einen Nominatim-Suchtreffer in die schlanke, vom Client genutzte Form.
// Defensiv: fehlende/fehlerhafte Felder -> null; nie werfen.
// ---------------------------------------------------------------------------

export type GeoSuggestion = {
  displayName: string
  lat: string | null
  lon: string | null
  road: string | null
  houseNumber: string | null
  city: string | null
  postcode: string | null
}

// Rohform, wie Nominatim sie mit addressdetails=1 liefert (nur genutzte Felder).
export type NominatimRaw = {
  display_name?: unknown
  lat?: unknown
  lon?: unknown
  address?: {
    road?: unknown
    house_number?: unknown
    city?: unknown
    town?: unknown
    village?: unknown
    municipality?: unknown
    postcode?: unknown
  } | null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

/** Mappt einen Nominatim-Treffer defensiv auf GeoSuggestion (oder null bei Unbrauchbarkeit). */
export function mapNominatimResult(raw: NominatimRaw | null | undefined): GeoSuggestion | null {
  if (!raw || typeof raw !== 'object') return null
  const displayName = str(raw.display_name)
  if (!displayName) return null
  const a = raw.address ?? {}
  // Stadt kann unter city/town/village/municipality stehen.
  const city = str(a.city) ?? str(a.town) ?? str(a.village) ?? str(a.municipality)
  return {
    displayName,
    lat: str(raw.lat),
    lon: str(raw.lon),
    road: str(a.road),
    houseNumber: str(a.house_number),
    city,
    postcode: str(a.postcode),
  }
}

/** Baut aus einem Treffer die kombinierte Adresszeile „Straße Hausnummer". */
export function formatStreet(s: GeoSuggestion): string {
  return [s.road, s.houseNumber].filter(Boolean).join(' ')
}
