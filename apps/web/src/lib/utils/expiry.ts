import { differenceInDays, startOfDay } from 'date-fns';

// ---------------------------------------------------------------------------
// ExpiryStatus
// ---------------------------------------------------------------------------

export const ExpiryStatus = {
  /** MHD liegt weit in der Zukunft (jenseits der gelben Warnschwelle) */
  FRESH: 'FRESH',
  /** MHD liegt in der Zukunft, aber unterhalb der Warnschwelle */
  OK: 'OK',
  /** Gelbe Warnschwelle unterschritten */
  SOON: 'SOON',
  /** Rote Warnschwelle unterschritten */
  CRITICAL: 'CRITICAL',
  /** MHD überschritten (unter Berücksichtigung von toleranceDays) */
  EXPIRED: 'EXPIRED',
} as const;

export type ExpiryStatus = (typeof ExpiryStatus)[keyof typeof ExpiryStatus];

// ---------------------------------------------------------------------------
// CSS class map
// ---------------------------------------------------------------------------

export const EXPIRY_CLASS: Record<ExpiryStatus, string> = {
  [ExpiryStatus.FRESH]: 'mhd-fresh',
  [ExpiryStatus.OK]: 'mhd-ok',
  [ExpiryStatus.SOON]: 'mhd-soon',
  [ExpiryStatus.CRITICAL]: 'mhd-critical',
  [ExpiryStatus.EXPIRED]: 'mhd-expired',
};

// ---------------------------------------------------------------------------
// getDaysRemaining
// ---------------------------------------------------------------------------

/**
 * Gibt die Anzahl verbleibender Tage bis zum MHD zurück.
 *
 * - Positiver Wert: MHD liegt noch in der Zukunft.
 * - 0: MHD ist heute.
 * - Negativer Wert: MHD ist überschritten.
 *
 * `toleranceDays` verschiebt den effektiven Ablaufpunkt nach hinten.
 * Beispiel: bestBeforeDate = gestern, toleranceDays = 2 → daysRemaining = 1
 */
export function getDaysRemaining(bestBeforeDate: Date, toleranceDays: number): number {
  const today = startOfDay(new Date());
  const effectiveExpiry = startOfDay(bestBeforeDate);
  // differenceInDays(later, earlier) → positive wenn later > earlier
  return differenceInDays(effectiveExpiry, today) + toleranceDays;
}

// ---------------------------------------------------------------------------
// getExpiryStatus
// ---------------------------------------------------------------------------

/**
 * Berechnet den MHD-Status eines Produkts.
 *
 * @param bestBeforeDate  MHD als Date-Objekt, oder null wenn kein MHD vorhanden.
 * @param toleranceDays   Toleranz in Tagen, um die der effektive Ablaufpunkt nach hinten verschoben wird.
 * @param config          Schwellenwerte:
 *                        - yellowDaysBefore: ab wie vielen Tagen vor Ablauf Status SOON gilt
 *                        - redDaysBefore:    ab wie vielen Tagen vor Ablauf Status CRITICAL gilt
 *
 * Logik (geprüft in Reihenfolge):
 *   daysRemaining < 0          → EXPIRED
 *   daysRemaining < redDays    → CRITICAL
 *   daysRemaining < yellowDays → SOON
 *   daysRemaining < yellowDays * 2 (heuristisch "nah dran") → OK
 *   sonst                      → FRESH
 */
export function getExpiryStatus(
  bestBeforeDate: Date | null,
  toleranceDays: number,
  config: { yellowDaysBefore: number; redDaysBefore: number },
): ExpiryStatus {
  if (bestBeforeDate === null) {
    return ExpiryStatus.FRESH;
  }

  const days = getDaysRemaining(bestBeforeDate, toleranceDays);
  const { yellowDaysBefore, redDaysBefore } = config;

  if (days < 0) {
    return ExpiryStatus.EXPIRED;
  }

  if (days < redDaysBefore) {
    return ExpiryStatus.CRITICAL;
  }

  if (days < yellowDaysBefore) {
    return ExpiryStatus.SOON;
  }

  // "OK"-Zone: zwischen yellowDaysBefore und dem doppelten Wert
  if (days < yellowDaysBefore * 2) {
    return ExpiryStatus.OK;
  }

  return ExpiryStatus.FRESH;
}

// ---------------------------------------------------------------------------
// getExpiryLabel
// ---------------------------------------------------------------------------

/**
 * Gibt einen deutschen Anzeigetext für den MHD-Status zurück.
 *
 * @param status        Berechneter ExpiryStatus.
 * @param daysRemaining Verbleibende Tage (darf negativ sein).
 *
 * Sonderfälle:
 *   - daysRemaining === 0 → "Heute ablaufend"
 *   - status === EXPIRED  → "Abgelaufen seit N Tag(en)"
 *   - status === FRESH / OK / SOON / CRITICAL mit daysRemaining > 0 → "Noch N Tag(e)"
 *   - bestBeforeDate war null (kein MHD) → wird extern mit daysRemaining = Infinity signalisiert
 */
export function getExpiryLabel(status: ExpiryStatus, daysRemaining: number): string {
  // Kein MHD hinterlegt — Aufrufer übergibt typischerweise NaN oder Infinity
  if (!isFinite(daysRemaining)) {
    return 'Kein MHD';
  }

  if (daysRemaining === 0) {
    return 'Heute ablaufend';
  }

  if (status === ExpiryStatus.EXPIRED) {
    const abgelaufen = Math.abs(daysRemaining);
    return abgelaufen === 1 ? 'Abgelaufen seit 1 Tag' : `Abgelaufen seit ${abgelaufen} Tagen`;
  }

  if (daysRemaining === 1) {
    return 'Noch 1 Tag';
  }

  return `Noch ${daysRemaining} Tage`;
}
