import { describe, it, expect } from 'vitest'
import { formatRelativeDays } from './relative-time'

// Fixer Bezugspunkt (Mittag, damit Uhrzeit-Ränder nicht ins Gewicht fallen).
const NOW = new Date('2026-07-24T12:00:00')

describe('formatRelativeDays', () => {
  it('heute (gleicher Kalendertag, andere Uhrzeit)', () => {
    expect(formatRelativeDays('2026-07-24T08:30:00', NOW)).toBe('heute')
    expect(formatRelativeDays('2026-07-24T23:59:00', NOW)).toBe('heute')
  })

  it('gestern', () => {
    expect(formatRelativeDays('2026-07-23T20:00:00', NOW)).toBe('gestern')
  })

  it('vor N Tagen (N >= 2)', () => {
    expect(formatRelativeDays('2026-07-22T12:00:00', NOW)).toBe('vor 2 Tagen')
    expect(formatRelativeDays('2026-07-14T00:00:00', NOW)).toBe('vor 10 Tagen')
  })

  it('morgen / in N Tagen (Zukunft)', () => {
    expect(formatRelativeDays('2026-07-25T06:00:00', NOW)).toBe('morgen')
    expect(formatRelativeDays('2026-07-27T12:00:00', NOW)).toBe('in 3 Tagen')
  })

  it('akzeptiert Date-Objekte', () => {
    expect(formatRelativeDays(new Date('2026-07-23T10:00:00'), NOW)).toBe('gestern')
  })

  it('null/undefined/ungültig → leerer String', () => {
    expect(formatRelativeDays(null, NOW)).toBe('')
    expect(formatRelativeDays(undefined, NOW)).toBe('')
    expect(formatRelativeDays('nicht-ein-datum', NOW)).toBe('')
  })
})
