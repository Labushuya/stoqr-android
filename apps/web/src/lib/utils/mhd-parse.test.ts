import { describe, it, expect } from 'vitest'
import {
  expandYear,
  extractDates,
  prioritiseMhdDates,
  latestDate,
  parseMhdText,
} from './mhd-parse'

// Fixes "jetzt" fuer deterministische expandYear-Tests (kein echter Clock-Zugriff).
const NOW = 2026

describe('expandYear', () => {
  it('mappt 00-49 auf 2000-2049', () => {
    expect(expandYear(27, NOW)).toBe(2027)
    expect(expandYear(49, NOW)).toBe(2049)
  })
  it('schiebt lang zurueckliegende Jahre um 100 nach vorn', () => {
    // 90 -> 1990, liegt > 1 Jahr zurueck -> +100 = 2090
    expect(expandYear(90, NOW)).toBe(2090)
  })
})

describe('extractDates', () => {
  it('erkennt DD.MM.YYYY', () => {
    expect(extractDates('MHD: 15.08.2027', NOW)).toContain('2027-08-15')
  })
  it('erkennt DD.MM.YY (kurzes Jahr)', () => {
    expect(extractDates('haltbar bis: 03.12.27', NOW)).toContain('2027-12-03')
  })
  it('erkennt MM/YYYY als ersten Tag des Monats', () => {
    expect(extractDates('05/2028', NOW)).toContain('2028-05-01')
  })
  it('erkennt ISO YYYY-MM-DD', () => {
    expect(extractDates('2029-01-31', NOW)).toContain('2029-01-31')
  })
  it('verwirft unplausible Monate/Tage', () => {
    expect(extractDates('45.99.2027', NOW)).toEqual([])
  })
})

describe('prioritiseMhdDates', () => {
  it('bevorzugt Datum in einer MHD-Praefix-Zeile', () => {
    const text = 'Produktion: 01.01.2026\nMHD: 10.10.2027'
    const all = extractDates(text, NOW)
    expect(prioritiseMhdDates(text, all, NOW)).toContain('2027-10-10')
  })
  it('faellt ohne Praefix auf alle Daten zurueck', () => {
    const text = '01.01.2027'
    const all = extractDates(text, NOW)
    expect(prioritiseMhdDates(text, all, NOW)).toEqual(all)
  })
})

describe('latestDate', () => {
  it('gibt das spaeteste ISO-Datum zurueck', () => {
    expect(latestDate(['2026-01-01', '2027-05-05', '2026-12-31'])).toBe('2027-05-05')
  })
  it('gibt null bei leerer Liste', () => {
    expect(latestDate([])).toBeNull()
  })
})

describe('parseMhdText', () => {
  it('liefert das wahrscheinlichste MHD aus gemischtem Text', () => {
    const raw = 'Charge 123\nProduktion 01.06.2026\nMindestens haltbar bis: 15.09.2027'
    const r = parseMhdText(raw, NOW)
    expect(r.found).toBe(true)
    expect(r.date).toBe('2027-09-15')
  })
  it('found=false ohne erkennbares Datum', () => {
    const r = parseMhdText('kein Datum hier', NOW)
    expect(r.found).toBe(false)
    expect(r.date).toBeNull()
  })
})
