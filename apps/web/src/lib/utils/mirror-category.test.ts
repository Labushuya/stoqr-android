import { describe, it, expect } from 'vitest'
import {
  resolveMirrorCategory,
  mirrorCategoryTag,
  canTakeMirrorPrice,
  defaultSnapFields,
  mirrorSubmitCategoryId,
} from './mirror-category'

// Eckfaelle, die die Regressionen G20/G22/G34/G36/G37 gekostet haben — als
// Wahrheitstabelle festgeschrieben, damit kuenftige Aenderungen sie fangen.

describe('resolveMirrorCategory', () => {
  it('1. aktive Session-Wahl gewinnt immer', () => {
    expect(resolveMirrorCategory({ sessionChoice: 'sess', autoMatch: 'auto', stored: 'stor', differs: true, categorySource: 'manual' })).toBe('sess')
  })
  it('2. manuell gespeicherte Kategorie schlaegt den abweichenden Regel-Vorschlag (G37)', () => {
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: 'regel', stored: 'manuell-kat', differs: true, categorySource: 'manual' })).toBe('manuell-kat')
  })
  it('3. abweichender Regel-Vorschlag gewinnt bei NICHT-manueller Kategorie (G34)', () => {
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: 'regel', stored: 'alt', differs: true, categorySource: 'globus' })).toBe('regel')
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: 'regel', stored: 'alt', differs: true, categorySource: null })).toBe('regel')
  })
  it('4. ohne Abweichung: gespeicherte Kategorie (G22-1)', () => {
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: 'auto', stored: 'stor', differs: false, categorySource: 'off' })).toBe('stor')
  })
  it('5. Fallback autoMatch, dann leer', () => {
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: 'auto', stored: null, differs: false, categorySource: null })).toBe('auto')
    expect(resolveMirrorCategory({ sessionChoice: null, autoMatch: null, stored: null, differs: false, categorySource: null })).toBe('')
  })
  it('leere Session-Wahl ("") faellt durch (falsy)', () => {
    expect(resolveMirrorCategory({ sessionChoice: '', autoMatch: null, stored: 'stor', differs: false, categorySource: null })).toBe('stor')
  })
})

describe('mirrorCategoryTag', () => {
  const base = { sessionChoice: null, categorySource: null as 'off' | 'globus' | 'manual' | null, differs: false, autoMatch: null, stored: null, rawCategoryLen: 0 }
  it('manuell (Session-Wahl ODER categorySource manual)', () => {
    expect(mirrorCategoryTag({ ...base, sessionChoice: 'x' }).label).toBe('manuell')
    expect(mirrorCategoryTag({ ...base, categorySource: 'manual', stored: 's', differs: true, autoMatch: 'a' }).label).toBe('manuell')
  })
  it('Regel-Vorschlag bei Abweichung + Auto-Match', () => {
    const t = mirrorCategoryTag({ ...base, differs: true, autoMatch: 'a', categorySource: 'globus', stored: 'b' })
    expect(t).toEqual({ label: 'Regel-Vorschlag', variant: 'suggest' })
  })
  it('gesetzt: gespeichert + keine Abweichung', () => {
    expect(mirrorCategoryTag({ ...base, stored: 's', differs: false }).label).toBe('gesetzt')
  })
  it('nicht zuordenbar: Globus-Pfad vorhanden, aber kein Auto-Match', () => {
    expect(mirrorCategoryTag({ ...base, rawCategoryLen: 3, autoMatch: null }).label).toBe('nicht zuordenbar')
  })
  it('abweichend: differs ohne Auto-Match und ohne stored', () => {
    expect(mirrorCategoryTag({ ...base, differs: true, autoMatch: null, rawCategoryLen: 0 }).label).toBe('abweichend')
  })
  it('gleich: nichts trifft zu', () => {
    expect(mirrorCategoryTag(base).label).toBe('gleich')
  })
})

describe('canTakeMirrorPrice', () => {
  it('nur mit Preis UND Markt', () => {
    expect(canTakeMirrorPrice({ priceCt: 199, storeId: 's1' })).toBe(true)
    expect(canTakeMirrorPrice({ priceCt: 199, storeId: null })).toBe(false)
    expect(canTakeMirrorPrice({ priceCt: null, storeId: 's1' })).toBe(false)
  })
  it('priceCt 0 ist gueltig (!= null)', () => {
    expect(canTakeMirrorPrice({ priceCt: 0, storeId: 's1' })).toBe(true)
  })
})

describe('defaultSnapFields', () => {
  it('spiegelt Diffs + Preis-Uebernehmbarkeit', () => {
    expect(defaultSnapFields({ imageDiffers: true, nameDiffers: false, categoryDiffers: true, priceCt: 100, storeId: 's' }))
      .toEqual({ image: true, name: false, category: true, price: true, brand: false, description: false })
    expect(defaultSnapFields({ imageDiffers: false, nameDiffers: false, categoryDiffers: false, priceCt: null, storeId: null }))
      .toEqual({ image: false, name: false, category: false, price: false, brand: false, description: false })
  })
  it('brand/description-Diffs schlagen durch (G45)', () => {
    expect(defaultSnapFields({ imageDiffers: false, nameDiffers: false, categoryDiffers: false, priceCt: null, storeId: null, brandDiffers: true, descriptionDiffers: true }))
      .toEqual({ image: false, name: false, category: false, price: false, brand: true, description: true })
  })
})

describe('mirrorSubmitCategoryId', () => {
  it('sendet nur die manuelle Session-Wahl (kein Auto/Regel)', () => {
    expect(mirrorSubmitCategoryId({ categorySelected: true, sessionChoice: 'sess' })).toBe('sess')
    expect(mirrorSubmitCategoryId({ categorySelected: true, sessionChoice: null })).toBe(undefined)
    expect(mirrorSubmitCategoryId({ categorySelected: false, sessionChoice: 'sess' })).toBe(undefined)
  })
})
