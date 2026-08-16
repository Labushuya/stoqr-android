import { describe, it, expect } from 'vitest'
import { matchMappingRules, normalizeToken } from './category-mapping-match'

const rules = new Map<string, string>([
  ['en:beverages', 'cat-getraenke'],
  ['kühlregal', 'cat-milch'],
  ['joghurt', 'cat-joghurt'],
])

describe('normalizeToken', () => {
  it('trimmt und lowercased', () => {
    expect(normalizeToken('  Kühlregal ')).toBe('kühlregal')
  })
})

describe('matchMappingRules', () => {
  it('OFF: matcht ganzen Tag (case-insensitiv)', () => {
    expect(matchMappingRules(['en:snacks', 'en:beverages'], rules)).toBe('cat-getraenke')
    expect(matchMappingRules(['EN:BEVERAGES'], rules)).toBe('cat-getraenke')
  })

  it('Globus: spezifischstes Segment zuerst (specificLast)', () => {
    // Pfad grob→fein: Kühlregal (matcht cat-milch) enthaelt Joghurt (cat-joghurt).
    // specificLast → von hinten → Joghurt gewinnt.
    expect(matchMappingRules(['Kühlregal', 'Joghurt'], rules, { specificLast: true })).toBe('cat-joghurt')
  })

  it('kein Treffer → null', () => {
    expect(matchMappingRules(['en:unbekannt', 'Fremdsegment'], rules)).toBe(null)
  })

  it('leere Tokens/Regeln → null', () => {
    expect(matchMappingRules([], rules)).toBe(null)
    expect(matchMappingRules(['en:beverages'], new Map())).toBe(null)
    expect(matchMappingRules(null, rules)).toBe(null)
  })

  it('kein Substring-Match (nur ganzes Segment)', () => {
    // 'beverages' allein ist NICHT 'en:beverages'
    expect(matchMappingRules(['beverages'], rules)).toBe(null)
  })
})
