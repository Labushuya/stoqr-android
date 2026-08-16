// Kuratierte Farb-Emoji-Liste fuer Icon-Picker (Kategorien G24/G25 + Raeume/Orte G26).
// BEWUSST kuratiert (statt nativem OS-Picker), damit JEDES Icon ein Farb-Emoji ist
// — keine monochromen Text-Symbole wie ❄ (U+2744 ohne Variation-Selector), die
// neben den Basis-Emojis (🥦🥛🥩…) uneinheitlich aussehen.
//
// Jedes Item: das Emoji + Gruppe + deutsche/englische Such-Keywords (lowercase).
// group steuert nur die KONTEXT-VORSORTIERUNG (emojisByContext) — die Suche
// (filterEmojis) durchsucht immer ALLE Gruppen.
// Fuer Kaelte ist bewusst ❄️ (mit Variation-Selector U+FE0F) enthalten → Farb-Emoji.

export type EmojiGroup = 'food' | 'place' | 'general'
export type EmojiEntry = { emoji: string; group: EmojiGroup; keywords: string[] }

export const CATEGORY_EMOJIS: EmojiEntry[] = [
  // ── Lebensmittel (food) ──────────────────────────────────────────────────
  // Obst & Gemuese
  { emoji: '🥦', group: 'food', keywords: ['brokkoli', 'broccoli', 'gemuese', 'vegetable', 'gruen'] },
  { emoji: '🥕', group: 'food', keywords: ['karotte', 'moehre', 'carrot', 'gemuese'] },
  { emoji: '🍅', group: 'food', keywords: ['tomate', 'tomato', 'gemuese'] },
  { emoji: '🥬', group: 'food', keywords: ['salat', 'blattgemuese', 'lettuce', 'kohl'] },
  { emoji: '🌽', group: 'food', keywords: ['mais', 'corn'] },
  { emoji: '🥔', group: 'food', keywords: ['kartoffel', 'potato'] },
  { emoji: '🧅', group: 'food', keywords: ['zwiebel', 'onion'] },
  { emoji: '🧄', group: 'food', keywords: ['knoblauch', 'garlic'] },
  { emoji: '🍎', group: 'food', keywords: ['apfel', 'apple', 'obst', 'fruit'] },
  { emoji: '🍌', group: 'food', keywords: ['banane', 'banana', 'obst'] },
  { emoji: '🍇', group: 'food', keywords: ['trauben', 'grapes', 'obst'] },
  { emoji: '🍓', group: 'food', keywords: ['erdbeere', 'strawberry', 'beere', 'obst'] },
  { emoji: '🍊', group: 'food', keywords: ['orange', 'zitrus', 'obst'] },
  { emoji: '🍋', group: 'food', keywords: ['zitrone', 'lemon', 'zitrus'] },
  { emoji: '🫐', group: 'food', keywords: ['heidelbeere', 'blaubeere', 'blueberry', 'beere'] },
  { emoji: '🍉', group: 'food', keywords: ['melone', 'wassermelone', 'melon', 'obst'] },
  { emoji: '🍑', group: 'food', keywords: ['pfirsich', 'peach', 'obst'] },
  { emoji: '🥑', group: 'food', keywords: ['avocado', 'obst'] },
  { emoji: '🍄', group: 'food', keywords: ['pilz', 'champignon', 'mushroom'] },
  // Milchprodukte
  { emoji: '🥛', group: 'food', keywords: ['milch', 'milk', 'milchprodukt', 'dairy'] },
  { emoji: '🧀', group: 'food', keywords: ['kaese', 'cheese', 'milchprodukt'] },
  { emoji: '🧈', group: 'food', keywords: ['butter', 'milchprodukt'] },
  { emoji: '🥚', group: 'food', keywords: ['ei', 'egg', 'eier'] },
  { emoji: '🍦', group: 'food', keywords: ['eis', 'eiscreme', 'icecream', 'dessert'] },
  // Fleisch & Fisch
  { emoji: '🥩', group: 'food', keywords: ['fleisch', 'steak', 'meat'] },
  { emoji: '🍗', group: 'food', keywords: ['haehnchen', 'gefluegel', 'chicken', 'poultry', 'fleisch'] },
  { emoji: '🥓', group: 'food', keywords: ['speck', 'bacon', 'fleisch'] },
  { emoji: '🌭', group: 'food', keywords: ['wurst', 'sausage', 'hotdog', 'fleisch'] },
  { emoji: '🐟', group: 'food', keywords: ['fisch', 'fish'] },
  { emoji: '🍤', group: 'food', keywords: ['garnele', 'shrimp', 'meeresfruechte', 'seafood'] },
  // Brot & Backwaren
  { emoji: '🍞', group: 'food', keywords: ['brot', 'bread', 'backwaren', 'bakery'] },
  { emoji: '🥖', group: 'food', keywords: ['baguette', 'brot', 'backwaren'] },
  { emoji: '🥐', group: 'food', keywords: ['croissant', 'gebaeck', 'backwaren'] },
  { emoji: '🥨', group: 'food', keywords: ['brezel', 'pretzel', 'backwaren'] },
  { emoji: '🧇', group: 'food', keywords: ['waffel', 'waffle'] },
  { emoji: '🥯', group: 'food', keywords: ['bagel', 'backwaren'] },
  { emoji: '🍰', group: 'food', keywords: ['kuchen', 'cake', 'torte', 'backwaren'] },
  { emoji: '🧁', group: 'food', keywords: ['muffin', 'cupcake', 'backwaren'] },
  { emoji: '🍪', group: 'food', keywords: ['keks', 'cookie', 'plaetzchen'] },
  // Getraenke
  { emoji: '🍺', group: 'food', keywords: ['bier', 'beer', 'getraenk', 'alkohol'] },
  { emoji: '🍷', group: 'food', keywords: ['wein', 'wine', 'getraenk', 'alkohol'] },
  { emoji: '🥤', group: 'food', keywords: ['softdrink', 'limo', 'cola', 'getraenk', 'becher'] },
  { emoji: '🧃', group: 'food', keywords: ['saft', 'juice', 'getraenk', 'tetrapak'] },
  { emoji: '💧', group: 'food', keywords: ['wasser', 'water', 'getraenk', 'tropfen'] },
  { emoji: '☕', group: 'food', keywords: ['kaffee', 'coffee', 'tee', 'getraenk', 'heiss'] },
  { emoji: '🍵', group: 'food', keywords: ['tee', 'tea', 'getraenk', 'matcha'] },
  { emoji: '🍾', group: 'food', keywords: ['sekt', 'champagner', 'flasche', 'getraenk'] },
  // Suessigkeiten & Snacks
  { emoji: '🍫', group: 'food', keywords: ['schokolade', 'chocolate', 'suess', 'snack'] },
  { emoji: '🍬', group: 'food', keywords: ['bonbon', 'candy', 'suess', 'suessigkeit'] },
  { emoji: '🍭', group: 'food', keywords: ['lutscher', 'lollipop', 'suess'] },
  { emoji: '🍿', group: 'food', keywords: ['popcorn', 'snack'] },
  { emoji: '🥜', group: 'food', keywords: ['nuss', 'erdnuss', 'peanut', 'snack'] },
  { emoji: '🍩', group: 'food', keywords: ['donut', 'suess'] },
  { emoji: '🍯', group: 'food', keywords: ['honig', 'honey', 'suess'] },
  // Gewuerze & Sossen
  { emoji: '🧂', group: 'food', keywords: ['salz', 'gewuerz', 'salt', 'spice'] },
  { emoji: '🌶️', group: 'food', keywords: ['chili', 'scharf', 'pepper', 'gewuerz'] },
  { emoji: '🫙', group: 'food', keywords: ['glas', 'einmachglas', 'sosse', 'sauce', 'jar'] },
  { emoji: '🍶', group: 'food', keywords: ['sosse', 'sauce', 'oel', 'essig', 'flasche'] },
  { emoji: '🫒', group: 'food', keywords: ['olive', 'oel', 'oil'] },
  // Grundnahrung
  { emoji: '🍝', group: 'food', keywords: ['pasta', 'nudeln', 'spaghetti', 'noodle'] },
  { emoji: '🍚', group: 'food', keywords: ['reis', 'rice'] },
  { emoji: '🥣', group: 'food', keywords: ['muesli', 'cereal', 'schuessel', 'flocken'] },
  { emoji: '🌾', group: 'food', keywords: ['getreide', 'grain', 'mehl', 'weizen'] },
  { emoji: '🍕', group: 'food', keywords: ['pizza', 'fertiggericht'] },
  { emoji: '🥘', group: 'food', keywords: ['eintopf', 'gericht', 'pfanne', 'fertig'] },
  { emoji: '🥫', group: 'food', keywords: ['konserve', 'dose', 'can', 'canned'] },

  // ── Raeume, Moebel & Lagerorte (place) ─────────────────────────────────────
  { emoji: '🏠', group: 'place', keywords: ['haus', 'zuhause', 'raum', 'home', 'wohnung'] },
  { emoji: '🍳', group: 'place', keywords: ['kueche', 'kitchen', 'kochen', 'pfanne'] },
  { emoji: '🛋️', group: 'place', keywords: ['wohnzimmer', 'sofa', 'couch', 'livingroom'] },
  { emoji: '🛏️', group: 'place', keywords: ['schlafzimmer', 'bett', 'bedroom'] },
  { emoji: '🛁', group: 'place', keywords: ['bad', 'badezimmer', 'wanne', 'bathroom'] },
  { emoji: '🚿', group: 'place', keywords: ['dusche', 'bad', 'shower'] },
  { emoji: '🚪', group: 'place', keywords: ['tuer', 'door', 'zimmer', 'raum'] },
  { emoji: '🪟', group: 'place', keywords: ['fenster', 'window'] },
  { emoji: '🪑', group: 'place', keywords: ['stuhl', 'chair', 'moebel'] },
  { emoji: '🗄️', group: 'place', keywords: ['schrank', 'aktenschrank', 'cabinet', 'regal', 'lager', 'fach'] },
  { emoji: '🚽', group: 'place', keywords: ['wc', 'toilette', 'bad'] },
  { emoji: '🧊', group: 'place', keywords: ['gefrierfach', 'tiefkuehl', 'eis', 'ice', 'kalt', 'gefroren', 'kuehl'] },
  { emoji: '❄️', group: 'place', keywords: ['gefrierschrank', 'tiefkuehl', 'frozen', 'kaelte', 'kalt', 'schnee', 'kuehl'] },
  { emoji: '🌡️', group: 'place', keywords: ['temperatur', 'kuehl', 'thermometer', 'kalt'] },
  { emoji: '🧺', group: 'place', keywords: ['korb', 'waesche', 'vorrat', 'lager'] },
  { emoji: '📦', group: 'place', keywords: ['karton', 'box', 'paket', 'lager', 'kiste', 'vorrat', 'sonstiges'] },
  { emoji: '🗃️', group: 'place', keywords: ['box', 'ablage', 'lager', 'fach'] },
  { emoji: '🏚️', group: 'place', keywords: ['keller', 'schuppen', 'lager', 'speicher'] },
  { emoji: '🚗', group: 'place', keywords: ['garage', 'auto', 'car'] },
  { emoji: '🌱', group: 'place', keywords: ['garten', 'balkon', 'garden', 'pflanze'] },

  // ── Haushalt / Allgemein (general) ─────────────────────────────────────────
  { emoji: '🧻', group: 'general', keywords: ['papier', 'toilettenpapier', 'kuechenrolle', 'haushalt'] },
  { emoji: '🧼', group: 'general', keywords: ['seife', 'reiniger', 'soap', 'haushalt', 'putzen'] },
  { emoji: '🧴', group: 'general', keywords: ['flasche', 'pflege', 'shampoo', 'lotion', 'haushalt'] },
  { emoji: '🧽', group: 'general', keywords: ['schwamm', 'sponge', 'putzen', 'haushalt'] },
  { emoji: '🧹', group: 'general', keywords: ['besen', 'kehren', 'putzen', 'haushalt'] },
  { emoji: '💊', group: 'general', keywords: ['medikament', 'tablette', 'pille', 'gesundheit', 'apotheke'] },
  { emoji: '🩹', group: 'general', keywords: ['pflaster', 'verband', 'erste hilfe', 'gesundheit'] },
  { emoji: '🔧', group: 'general', keywords: ['werkzeug', 'tool', 'schraube', 'reparatur'] },
  { emoji: '🧰', group: 'general', keywords: ['werkzeugkasten', 'toolbox', 'werkzeug'] },
  { emoji: '💡', group: 'general', keywords: ['lampe', 'gluehbirne', 'licht', 'strom'] },
  { emoji: '🔋', group: 'general', keywords: ['batterie', 'akku', 'strom'] },
  { emoji: '🐕', group: 'general', keywords: ['hund', 'tierfutter', 'haustier', 'pet'] },
  { emoji: '🐈', group: 'general', keywords: ['katze', 'tierfutter', 'haustier', 'pet'] },
  { emoji: '🍼', group: 'general', keywords: ['baby', 'flaeschchen', 'saeugling'] },
  { emoji: '🏷️', group: 'general', keywords: ['label', 'etikett', 'sonstiges', 'allgemein'] },
]

/** Filtert die Emoji-Liste per Suchbegriff (matcht Keywords als Substring). Leer → alle. */
export function filterEmojis(query: string): EmojiEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return CATEGORY_EMOJIS
  return CATEGORY_EMOJIS.filter((e) => e.keywords.some((k) => k.includes(q)))
}

/**
 * Kontext-Vorsortierung fuer die leere Suche: die passende Gruppe zuerst, dann
 * general, dann der Rest. 'category' → Lebensmittel oben; 'place' → Raeume/Orte oben.
 * Die vollstaendige Liste bleibt erhalten (Suche findet alles).
 */
export function emojisByContext(context: 'category' | 'place'): EmojiEntry[] {
  const primary: EmojiGroup = context === 'place' ? 'place' : 'food'
  const rank = (g: EmojiGroup): number => (g === primary ? 0 : g === 'general' ? 1 : 2)
  return [...CATEGORY_EMOJIS].sort((a, b) => rank(a.group) - rank(b.group))
}
