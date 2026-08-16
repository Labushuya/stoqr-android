// ---------------------------------------------------------------------------
// Relative Datums-Anzeige auf Tagesbasis (de-DE), rein und testbar.
//
// Für „verbraucht/gespendet/entsorgt vor X Tagen" (G41). Kalendertage, nicht
// 24h-Fenster: „gestern" = vorheriger Kalendertag, unabhängig von der Uhrzeit.
// ---------------------------------------------------------------------------

import { differenceInCalendarDays, parseISO } from 'date-fns'

function toDate(date: Date | string | null | undefined): Date | null {
  if (date == null) return null
  if (date instanceof Date) return date
  const d = parseISO(date)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Formatiert einen Zeitpunkt relativ zu `now` (Default: jetzt) auf Tagesbasis:
 * - heute
 * - gestern
 * - vor N Tagen (N >= 2)
 * - in N Tagen (falls das Datum in der Zukunft liegt — sollte für consumedAt
 *   nicht vorkommen, wird aber sauber behandelt: „morgen" / „in N Tagen")
 *
 * null/ungültig → '' (Aufrufer zeigt dann nur das Status-Badge ohne Zusatz).
 */
export function formatRelativeDays(
  date: Date | string | null | undefined,
  now: Date = new Date()
): string {
  const d = toDate(date)
  if (!d) return ''
  // differenceInCalendarDays(d, now): positiv = d liegt in der Zukunft.
  const diff = differenceInCalendarDays(d, now)
  if (diff === 0) return 'heute'
  if (diff === -1) return 'gestern'
  if (diff === 1) return 'morgen'
  if (diff < 0) return `vor ${Math.abs(diff)} Tagen`
  return `in ${diff} Tagen`
}
