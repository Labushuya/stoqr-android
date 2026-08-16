// ---------------------------------------------------------------------------
// Katalog-Spiegel-Diff (reine Funktion, testbar) — Block G10.
//
// Vergleicht die Stammdaten eines Artikels mit dem neuesten Globus-Katalog-
// Snapshot derselben EAN. Liefert je Feld, ob der Katalog abweicht (und ob das
// Artikelfeld leer ist). Preis bleibt bewusst aussen vor (laeuft ueber F2).
// ---------------------------------------------------------------------------

export type ArticleSide = {
  name: string | null
  imageUrl: string | null
  categoryId: string | null
  brand?: string | null
  description?: string | null
  hasDeposit?: boolean | null
}

export type CatalogSide = {
  name: string | null
  localImagePath: string | null
  /** Bereits auf eine stoqr-categoryId gemappte Katalog-Kategorie (best-effort). */
  categoryId: string | null
  /** Reichere Felder aus dem Detailseiten-JSON-LD (G45/G47). */
  brand?: string | null
  description?: string | null
  hasDeposit?: boolean | null
}

export type FieldDiff = {
  /** true = Katalog weicht vom Artikel ab (uebernehmenswert). */
  differs: boolean
  /** true = Artikelfeld ist leer, Katalog hat einen Wert (Luecke fuellen). */
  fillsGap: boolean
}

export type MirrorDiff = {
  name: FieldDiff
  image: FieldDiff
  category: FieldDiff
  brand: FieldDiff
  description: FieldDiff
  hasDeposit: FieldDiff
  /** true = mindestens ein Feld weicht ab. */
  any: boolean
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim()
}

/** Feldweiser Text-Diff: Katalog hat Wert, weicht vom Artikel ab. */
function textDiff(catalogVal: string | null | undefined, articleVal: string | null | undefined): FieldDiff {
  const cat = norm(catalogVal)
  const art = norm(articleVal)
  return cat !== '' && cat !== art ? { differs: true, fillsGap: art === '' } : { differs: false, fillsGap: false }
}

/** Vergleicht Artikel vs. Katalog-Snapshot feldweise (Name/Bild/Kategorie/Marke/Beschreibung). */
export function computeMirrorDiff(article: ArticleSide, catalog: CatalogSide | null): MirrorDiff {
  const empty: FieldDiff = { differs: false, fillsGap: false }
  if (!catalog) return { name: empty, image: empty, category: empty, brand: empty, description: empty, hasDeposit: empty, any: false }

  // Name: Katalog hat einen Namen, der sich vom Artikelnamen unterscheidet.
  const catName = norm(catalog.name)
  const artName = norm(article.name)
  const name: FieldDiff =
    catName !== '' && catName !== artName
      ? { differs: true, fillsGap: artName === '' }
      : empty

  // Bild: Katalog hat ein lokales Bild, Artikel hat keins oder ein anderes.
  const catImage = norm(catalog.localImagePath) ? `/media/${norm(catalog.localImagePath)}` : ''
  const artImage = norm(article.imageUrl)
  const image: FieldDiff =
    catImage !== '' && catImage !== artImage
      ? { differs: true, fillsGap: artImage === '' }
      : empty

  // Kategorie: Katalog konnte auf eine stoqr-Kategorie gemappt werden, die vom
  // Artikel abweicht.
  const catCat = norm(catalog.categoryId)
  const artCat = norm(article.categoryId)
  const category: FieldDiff =
    catCat !== '' && catCat !== artCat
      ? { differs: true, fillsGap: artCat === '' }
      : empty

  // Marke / Beschreibung (G45): reiner Text-Diff aus dem JSON-LD.
  const brand = textDiff(catalog.brand, article.brand)
  const description = textDiff(catalog.description, article.description)

  // Pfandpflicht (G47): Katalog signalisiert ja/nein; abweichend, wenn der Katalog
  // ein Signal hat und es vom Artikel abweicht. fillsGap, wenn der Artikel noch kein
  // Pfand gesetzt hat (null/false) und der Katalog 'ja' meldet.
  const catDep = catalog.hasDeposit
  const artDep = article.hasDeposit ?? false
  const hasDeposit: FieldDiff =
    catDep != null && catDep !== artDep
      ? { differs: true, fillsGap: !artDep }
      : empty

  return {
    name, image, category, brand, description, hasDeposit,
    any: name.differs || image.differs || category.differs || brand.differs || description.differs || hasDeposit.differs,
  }
}
