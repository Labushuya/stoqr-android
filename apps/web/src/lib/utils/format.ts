import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import type { StockTotals } from './stock';

function toDate(date: Date | string | null): Date | null {
  if (date === null) return null;
  if (date instanceof Date) return date;
  return parseISO(date);
}

export function formatDate(date: Date | string | null): string {
  const d = toDate(date);
  if (!d) return '—';
  return format(d, 'dd.MM.yyyy');
}

export function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    piece: 'Stück',
    gram: 'g',
    kg: 'kg',
    ml: 'ml',
    liter: 'l',
  };
  return map[unit] ?? unit;
}

export function formatQuantity(value: number | string, unit: string): string {
  return `${value} ${unitLabel(unit)}`;
}

export function formatPrice(cents: number | null): string {
  if (cents === null) return '—';
  const euros = cents / 100;
  return `€ ${euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function daysFromNow(date: Date | string | null): number | null {
  const d = toDate(date);
  if (!d) return null;
  return differenceInCalendarDays(d, new Date());
}

/**
 * Formatiert einen aggregierten Gesamtbestand, z.B. "2 Packung + 1,5 kg".
 * Gebinde (Einheiten v2): Gruppen mit packCount zeigen Dual „3 Flasche (4,5 l)".
 * Einheiten-Anzeige: mass/volume nutzen das Symbol (kg/g/ml/l), count nutzt den
 * aufgeloesten Namen (g.displayName, z.B. "Stück" statt Roh-Symbol "piece" — G21-1).
 * Leere Gruppen → "—".
 */
export function formatStockTotal(totals: StockTotals): string {
  if (!totals.groups.length) return '—';
  return totals.groups
    .map((g) => {
      const value = g.displayValue.toLocaleString('de-DE', { maximumFractionDigits: 3 });
      // count: Name (Stück/Packung/…); mass/volume: kompaktes Symbol (kg/g/ml/l).
      const unitLabel = g.dimension === 'count' ? g.displayName : g.displayUnit;
      if (g.packCount) {
        const pc = g.packCount.value.toLocaleString('de-DE', { maximumFractionDigits: 3 });
        return `${pc} ${g.packCount.unit} (${value} ${unitLabel})`;
      }
      return `${value} ${unitLabel}`;
    })
    .join(' + ');
}

