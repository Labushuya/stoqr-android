import { describe, it, expect } from 'vitest'
import { mapNominatimResult, formatStreet } from './geo'

describe('mapNominatimResult', () => {
  it('mappt einen vollständigen Treffer', () => {
    const r = mapNominatimResult({
      display_name: 'Globus, Hauptstraße 1, 68766 Hockenheim, Deutschland',
      lat: '49.3187',
      lon: '8.5518',
      address: { road: 'Hauptstraße', house_number: '1', city: 'Hockenheim', postcode: '68766' },
    })
    expect(r).toEqual({
      displayName: 'Globus, Hauptstraße 1, 68766 Hockenheim, Deutschland',
      lat: '49.3187',
      lon: '8.5518',
      road: 'Hauptstraße',
      houseNumber: '1',
      city: 'Hockenheim',
      postcode: '68766',
    })
  })

  it('nutzt town/village/municipality als Stadt-Fallback', () => {
    expect(mapNominatimResult({ display_name: 'X', address: { town: 'Walldorf' } })?.city).toBe('Walldorf')
    expect(mapNominatimResult({ display_name: 'X', address: { village: 'Kleindorf' } })?.city).toBe('Kleindorf')
    expect(mapNominatimResult({ display_name: 'X', address: { municipality: 'Kreis' } })?.city).toBe('Kreis')
  })

  it('liefert null ohne display_name', () => {
    expect(mapNominatimResult({ lat: '1', lon: '2' })).toBeNull()
    expect(mapNominatimResult({ display_name: '   ' })).toBeNull()
  })

  it('liefert null bei null/undefined/nicht-Objekt', () => {
    expect(mapNominatimResult(null)).toBeNull()
    expect(mapNominatimResult(undefined)).toBeNull()
  })

  it('setzt fehlende Felder auf null', () => {
    const r = mapNominatimResult({ display_name: 'Nur Name' })
    expect(r).toEqual({
      displayName: 'Nur Name',
      lat: null,
      lon: null,
      road: null,
      houseNumber: null,
      city: null,
      postcode: null,
    })
  })
})

describe('formatStreet', () => {
  const base = { displayName: 'X', lat: null, lon: null, city: null, postcode: null }
  it('kombiniert Straße + Hausnummer', () => {
    expect(formatStreet({ ...base, road: 'Hauptstraße', houseNumber: '1' })).toBe('Hauptstraße 1')
  })
  it('toleriert fehlende Hausnummer', () => {
    expect(formatStreet({ ...base, road: 'Hauptstraße', houseNumber: null })).toBe('Hauptstraße')
  })
  it('leer wenn nichts da', () => {
    expect(formatStreet({ ...base, road: null, houseNumber: null })).toBe('')
  })
})
