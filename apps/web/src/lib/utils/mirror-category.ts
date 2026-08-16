// Reine Entscheidungslogik des Katalog-Spiegels (Artikel-Sicherung), DB-/Svelte-frei
// und unit-testbar. Extrahiert aus einstellungen/+page.svelte (G38), damit die ueber
// G20/G22/G34/G36/G37 gewachsene Vorrang-/Anzeige-Logik durch Tests abgesichert ist,
// statt dass jeder Eckfall ein Deploy-Zyklus wird. KEINE Verhaltensaenderung.

export type FieldSource = 'off' | 'globus' | 'manual' | null

/**
 * Effektiv anzuzeigende Kategorie im Spiegel-Select. Vorrang (G22-1/G34/G37):
 *  1. aktive manuelle Session-Wahl (sessionChoice)
 *  2. MANUELL gespeicherte Kategorie schlaegt den Regel-Vorschlag (G37)
 *  3. frischer Regel-/Auto-Vorschlag bei Abweichung — nur nicht-manuell (G34)
 *  4. gespeicherte Kategorie (bleibt nach Uebernahme/Reload sichtbar — G22-1)
 *  5. best-effort autoMatch, 6. leer
 * sessionChoice==='' (falsy) faellt bewusst durch (wie im Original).
 */
export function resolveMirrorCategory(input: {
  sessionChoice: string | null | undefined
  autoMatch: string | null
  stored: string | null
  differs: boolean
  categorySource: FieldSource
}): string {
  const { sessionChoice, autoMatch, stored, differs, categorySource } = input
  if (sessionChoice) return sessionChoice
  if (categorySource === 'manual' && stored) return stored
  if (differs && autoMatch) return autoMatch
  return stored ?? autoMatch ?? ''
}

export type MirrorCategoryTag = {
  label: 'manuell' | 'Regel-Vorschlag' | 'gesetzt' | 'nicht zuordenbar' | 'abweichend' | 'gleich'
  variant: 'ok' | 'suggest' | 'warn' // ok→--ok, suggest→(kein Modifier), warn→--warn
}

/**
 * Status-Tag der Kategorie-Zeile im Spiegel. Reine 6-Zweig-Priorisierung,
 * verhaltensgleich zur frueheren {#if}-Kaskade (G34/G37).
 */
export function mirrorCategoryTag(input: {
  sessionChoice: string | null | undefined
  categorySource: FieldSource
  differs: boolean
  autoMatch: string | null
  stored: string | null
  rawCategoryLen: number
}): MirrorCategoryTag {
  const { sessionChoice, categorySource, differs, autoMatch, stored, rawCategoryLen } = input
  if (sessionChoice || categorySource === 'manual') return { label: 'manuell', variant: 'ok' }
  if (differs && autoMatch) return { label: 'Regel-Vorschlag', variant: 'suggest' }
  if (stored && !differs) return { label: 'gesetzt', variant: 'ok' }
  if (rawCategoryLen > 0 && !autoMatch) return { label: 'nicht zuordenbar', variant: 'warn' }
  if (differs) return { label: 'abweichend', variant: 'suggest' }
  return { label: 'gleich', variant: 'ok' }
}

/** Preis uebernehmbar nur mit Preis UND Markt-Bezug (priceCt=0 ist gueltig). */
export function canTakeMirrorPrice(input: { priceCt: number | null; storeId: string | null }): boolean {
  return input.priceCt != null && input.storeId != null
}

export type SnapFieldDefaults = { image: boolean; name: boolean; category: boolean; price: boolean; brand: boolean; description: boolean }

/** Default-Ankreuzung je Snapshot: abweichende Felder + uebernehmbarer Preis. */
export function defaultSnapFields(input: {
  imageDiffers: boolean
  nameDiffers: boolean
  categoryDiffers: boolean
  priceCt: number | null
  storeId: string | null
  brandDiffers?: boolean
  descriptionDiffers?: boolean
}): SnapFieldDefaults {
  return {
    image: input.imageDiffers,
    name: input.nameDiffers,
    category: input.categoryDiffers,
    price: canTakeMirrorPrice({ priceCt: input.priceCt, storeId: input.storeId }),
    brand: input.brandDiffers ?? false,
    description: input.descriptionDiffers ?? false,
  }
}

/**
 * categoryId, die beim Uebernehmen gesendet wird: NUR eine manuelle Session-Wahl
 * (Herkunft 'manual'). Ein Regel-/Auto-Vorschlag wird NICHT mitgeschickt — der
 * Server loest ihn selbst auf (Herkunft 'globus', G34). undefined = nicht senden.
 */
export function mirrorSubmitCategoryId(input: {
  categorySelected: boolean
  sessionChoice: string | null | undefined
}): string | undefined {
  return input.categorySelected ? (input.sessionChoice ?? undefined) : undefined
}
