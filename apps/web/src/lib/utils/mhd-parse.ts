// ---------------------------------------------------------------------------
// MHD-Datumsparser (pur, dialekt- und plattformneutral)
// ---------------------------------------------------------------------------
// Extrahiert aus dem OCR-Rohtext das wahrscheinlichste Mindesthaltbarkeitsdatum.
// Reine Funktionen ohne DB/Netz/Node-Abhaengigkeit — laufen server-seitig (Pi)
// UND in-browser (App, Tesseract.js im WebView). Getestet in mhd-parse.test.ts.

export interface OcrResult {
  found: boolean
  date: string | null
  raw: string
}

/**
 * Wandelt ein zweistelliges Jahr in ein vierstelliges.
 * 00–49 → 2000–2049, 50–99 → 1950–1999 (Standard-Sliding-Window).
 * Fuer MHD sind Jahre weit in der Vergangenheit unwahrscheinlich — liegt das
 * Ergebnis mehr als ein Jahr zurueck, wird es um 100 Jahre nach vorn geschoben.
 */
export function expandYear(yy: number, now: number = new Date().getFullYear()): number {
  const full = yy < 50 ? 2000 + yy : 1900 + yy
  if (full < now - 1) {
    return full + 100
  }
  return full
}

/**
 * Extrahiert ISO-8601-Daten (YYYY-MM-DD) aus OCR-Rohtext.
 * Erkennt: DD.MM.YYYY, DD.MM.YY (20YY), MM/YYYY, YYYY-MM-DD.
 */
export function extractDates(text: string, now?: number): string[] {
  const dates: string[] = []
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Pattern 1: DD.MM.YYYY
  const ddmmyyyy = /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g
  for (const m of normalised.matchAll(ddmmyyyy)) {
    const [, dd, mm, yyyy] = m
    const d = parseInt(dd, 10)
    const mo = parseInt(mm, 10)
    const y = parseInt(yyyy, 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  // Pattern 2: DD.MM.YY (kurzes Jahr)
  const ddmmyy = /\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/g
  for (const m of normalised.matchAll(ddmmyy)) {
    const [, dd, mm, yy] = m
    const d = parseInt(dd, 10)
    const mo = parseInt(mm, 10)
    const y = expandYear(parseInt(yy, 10), now)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
    }
  }

  // Pattern 3: MM/YYYY → erster Tag des Monats
  const mmyyyy = /\b(\d{1,2})\/(\d{4})\b/g
  for (const m of normalised.matchAll(mmyyyy)) {
    const [, mm, yyyy] = m
    const mo = parseInt(mm, 10)
    const y = parseInt(yyyy, 10)
    if (mo >= 1 && mo <= 12) {
      dates.push(`${y}-${String(mo).padStart(2, '0')}-01`)
    }
  }

  // Pattern 4: YYYY-MM-DD (bereits ISO)
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  for (const m of normalised.matchAll(iso)) {
    const [, yyyy, mm, dd] = m
    const mo = parseInt(mm, 10)
    const d = parseInt(dd, 10)
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      dates.push(`${yyyy}-${mm}-${dd}`)
    }
  }

  return dates
}

/**
 * Sucht bevorzugt in Zeilen mit bekannten MHD-Praefixen. Findet sich dort ein
 * Datum, gewinnt es; sonst Fallback auf alle gefundenen Daten.
 */
export function prioritiseMhdDates(text: string, allDates: string[], now?: number): string[] {
  const mhdPrefixes = [
    /MHD\s*:/i,
    /Best\s+by\s*:/i,
    /Mindestens\s+haltbar\s+bis\s*:/i,
    /haltbar\s+bis\s*:/i,
    /verbrauchen\s+bis\s*:/i,
    /zu\s+verbrauchen\s+bis\s*:/i,
  ]

  const lines = text.split('\n')
  const mhdLines: string[] = []
  for (const line of lines) {
    if (mhdPrefixes.some((rx) => rx.test(line))) {
      mhdLines.push(line)
    }
  }

  if (mhdLines.length === 0) {
    return allDates
  }

  const mhdText = mhdLines.join('\n')
  const mhdDates = extractDates(mhdText, now)
  return mhdDates.length > 0 ? mhdDates : allDates
}

/**
 * Spaetestes Datum aus einer ISO-8601-Liste — das wahrscheinlichste MHD
 * (nicht Produktions-/Verpackungsdatum).
 */
export function latestDate(dates: string[]): string | null {
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}

/**
 * Orchestrator: OCR-Rohtext -> OcrResult. Von Server (Pi) und Client (App)
 * gleichermassen genutzt, damit die MHD-Logik identisch ist.
 */
export function parseMhdText(rawText: string, now?: number): OcrResult {
  const allDates = extractDates(rawText, now)
  const candidates = prioritiseMhdDates(rawText, allDates, now)
  const best = latestDate(candidates)
  return {
    found: best !== null,
    date: best,
    raw: rawText.trim(),
  }
}
