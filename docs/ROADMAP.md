# stoqr — Roadmap

> Kanonisches Datenmodell und Entwicklungsplan. Diese Datei ist führend für Absicht,
> Logik und Ziel von stoqr. Bei Widersprüchen zwischen Code und dieser Datei gilt diese Datei.

Letzte Aktualisierung: 2026-08-14 (Angezeigter Name „Die Merbotts" + Gefahrenzone mit dreistufigem Werksreset G52/G53, Stufe C mit automatischem Re-Seed der Referenzdaten — kein manuelles seed.sql mehr; Baseline: Test-Manifest A–E vollständig grün, 214/214 auf Pi getestet, Stand Commit 7c2d49c)

---

## Zweck

stoqr erfasst Lebensmittelbestände und leitet daraus Verhaltensweisen, Trends,
Automatisierungen und Infos ab. Kernziel: klares, intuitives System mit sauberer
Datenbasis — besonders für die Bring!-Anbindung.

---

## Kanonisches Datenmodell (verbindlich seit 2026-07-11)

### Grundprinzip
**Stammdaten (Artikel) ≠ Transaktionsdaten (Bestand).**
Ein Artikel zu erstellen erzeugt **keinen** Bestand. Bestände werden separat über einen
dedizierten Button angelegt und referenzieren einen bestehenden Artikel.

### ARTIKEL (Stammdaten) — universeller Master-Artikel
Beschreibt EIN Lebensmittel-Konzept, existiert genau einmal (z.B. "Vollmilch").
```
- name            (z.B. "Vollmilch")
- description     (z.B. "Milch mit 3,5% Fett")
- category_id     (z.B. "Milchprodukte")
- default_unit    (Standard-Einheit)
- nutrients       (Nährwerte, EAV)
- notes
```
**EAN/Barcode:** primär am **Artikel** (`products.gtin`, im UI pflegbar). Markt, Lagerort, MHD, Menge NICHT im Artikel.

> **Aktualisiert (2026-07-14, M1-Feedback):** EAN ist jetzt **primär am Artikel** (`products.gtin`, UI-pflegbar).
> Bestand-EAN (`inventory_items.gtin`) bleibt **sekundär** für Ausreißer/Chargen. Fallback bei Bedarf: Bestandsanalyse.
> Damit ist `products.gtin` nicht mehr nur interner OFF-Cache, sondern das primäre Artikel-EAN.

### BESTAND (Transaktion) — konkrete physische Menge
Referenziert einen Artikel. Ein Artikel kann viele Bestände mit unterschiedlichen
Werten haben (verschiedene Märkte, MHDs, Lagerorte).
```
- product_id      → Artikel (FK)
- quantity        (Anzahl / Menge)
- unit
- best_before_date (MHD)
- gtin            (EAN/Barcode — am Bestand, NICHT am Artikel)
- store_id        (Markt / Bezugsquelle — am Bestand)
- place_id        (Lagerort: Raum > Lagerort > Fach — am Bestand)
- notes
- status          (available / consumed / discarded)
```

### MÄRKTE (Stammdaten)
```
- name, chain (optional), address (optional), city/plz (optional)
```

### ORTE (Stammdaten) — Hierarchie
```
Raum (location) > Lagerort (storage) > Fach (place)
```

### Entscheidungen (2026-07-11)
| Frage | Entscheidung |
|---|---|
| EAN | **primär am Artikel** (products.gtin, UI-pflegbar); sekundär am Bestand (Ausreißer) — *aktualisiert 2026-07-14* |
| Markt | am **Artikel** (M:N „wo einkaufbar", product_stores) UND am **Bestand** (Ist-Herkunft, store_id) |
| Lagerort | am **Bestand** (gleiches Produkt an mehreren Orten möglich) |
| Migration | Neue Migration + Testdaten-Reset |
| products.gtin | **primäres Artikel-EAN** (UI-pflegbar) — war zuvor nur interner OFF-Cache — *aktualisiert 2026-07-14* |
| products (Katalog) | **global/geteilt** (kein household_id) — ein Artikel für alle Haushalte |
| Artikelverwaltung | eigene Seite unter **Einstellungen → Artikel** (anlegen/ändern/löschen) |

---

---

## Artikel- vs. Bestands-Ebene — Priorisierung/Vererbung (verbindlich, dokumentiert 2026-07-19)

Grundprinzip: **Stammdaten (Artikel) ≠ Transaktionsdaten (Bestand).** Es gibt fast **keine** Laufzeit-Priorisierung —
die Ebenen bedeuten meist Verschiedenes. Nur GTIN hat eine Primär/Sekundär-Konvention, und nur das Gebinde ist echte
Laufzeit-Vererbung. Übersicht:

| Feld | Artikel (Stammdaten) | Bestand (Transaktion) | Regel |
|---|---|---|---|
| **EAN/GTIN** | `products.gtin` — primär, global unique, UI-pflegbar, Identität für Lookup | `inventory_items.gtin` — sekundär, nullable, für Ausreißer/Chargen | **Lookup-Konvention** (kein Anzeige-Fallback): alle Queries lesen nur `products.gtin`; Bestand-GTIN wird beim Anlegen kopiert, aber nirgends gelesen |
| **Einheit** | `products.defaultUnit` — Vorbelegung | `inventory_items.unit` — tatsächlich; einzige Rechen-Einheit der Aggregation | **Vorbelegung** des neuen Bestand-Formulars. Bestandswert ist danach autonom maßgeblich |
| **Markt** | `product_stores` (M:N) — Planung „wo einkaufbar" | `inventory_items.storeId` — Ist-Herkunft der Charge | **Keine Priorisierung** — bewusst getrennt (UND). Vorbelegung neuer Bestände kommt aus häufigstem storeId **früherer Bestände** (inventory-hints), nicht aus `product_stores` |
| **Gebinde** | `products.defaultVolumeMl`/`defaultWeightG` → `buildPackSize`, gilt für `defaultUnit` | `weightG`/`volumeMl` vorhanden, von Aggregation ignoriert | **Echte Laufzeit-Vererbung/Overlay** — Artikel-packSize wirkt auf alle Bestände (Aggregation, Estimate, Soll-Ist, Dual-Anzeige). Fallback ohne Gebinde: count je Symbol |
| **Preis** | `product_prices` (Artikel+Markt), `isCurrent` = maßgeblich fürs Estimate | `inventory_items.purchasePriceCt` — Ist-Beleg der Charge | **Keine Priorisierung** — verschiedene Zwecke. Estimate liest nur `product_prices`; Einbuchen schreibt beide (Bestand immer, `product_prices` nur bei `recordPrice=true`, source `booked`) |
| **Nährwerte** | `product_nutrients` (pro 100 g/ml) | — (kein Feld) | **Nur Artikel** — Bestand referenziert per Relation |

Kernaussagen: (1) GTIN-Primär/Sekundär ist eine Lookup-/Identitäts-Konvention, kein implementierter Anzeige-Fallback.
(2) Gebinde ist der einzige Fall echter Laufzeit-Vererbung. (3) Einheit ist reine Formular-Vorbelegung. (4) Markt und Preis
sind bewusst getrennte Ebenen. (5) Nährwerte existieren nur am Artikel.

---

## Ablauf (User-Flow)

1. Räume, Lagerorte, Fächer anlegen (Orte)
2. Artikel anlegen — nur Stammdaten, **kein** Bestand entsteht dabei
   - Schnell: `/inventar` → FAB „Neuer Artikel" (Name, Kategorie, Notiz)
   - Vollständig: `Einstellungen → Artikel` (anlegen/ändern/löschen)
3. Bestand anlegen — `/inventar` → „Bestand hinzufügen": Artikel wählen (oder EAN scannen),
   Ort, Anzahl + MHD + EAN + Markt + Notiz

---

## Bring!-Integration (Inkrement 2d)

Echte Bring!-API-Anbindung (User-Entscheidung): Login mit Bring-Zugangsdaten (verschlüsselt in DB,
ENCRYPTION_KEY), Einkaufsliste per API synchronisieren. Schema ist vorbereitet
(products.bringItemId, stores.bringListUuid, shoppingListItems.bringItemUuid, bring_sync_log).
Kein Text-/Pipe-Export (existiert so in Bring! nicht).

---

## Roadmap (Inkremente)

### Inkrement 1 — Modell-Umbau (abgeschlossen, Test ausstehend)
- [x] Schema: EAN + store_id ans Bestand (inventory_items), vom Artikel entfernt
- [x] Migration 0005 (gtin an Bestand, product_stores DROP) + 0006 (products.notes) + Reset
- [x] Artikel-Formular: nur Stammdaten (Name, Beschreibung, Kategorie, Einheit, Notizen)
- [x] Bestand-Formular (easy-add): Artikel wählen + Anzahl + MHD + EAN-Scan + Markt + Lagerort + Notiz
- [x] Barcode-Scanner vom Artikel- ins Bestand-Formular verschoben
- [x] product_stores (M:N) entfernt — Markt liegt jetzt am Bestand
- [x] Artikelverwaltung als eigene Seite: Einstellungen → Artikel (CRUD via /api/products)
- [x] products.gtin als interner OFF-Cache dokumentiert & belassen

> Alle Inkrement-1-Punkte sind implementiert & gepusht, aber **noch nicht von Christopher
> auf dem Pi getestet** — siehe „Offene Punkte / noch zu testen".

### Inkrement 2 — Auswertung & Bring! (aufgeteilt in 2a–2d)
- **2a — Gesamtbestand pro Artikel** (abgeschlossen, Test ausstehend):
  - [x] Einheiten-Umrechnungsschicht: units um dimension + to_base_factor (Migration 0007)
  - [x] Aggregationslogik lib/utils/stock.ts (mass/volume normalisiert, count je Einheit getrennt) + Tests
  - [x] Gesamtbestand-Anzeige auf der Artikel-Detailseite (z.B. „2 Packung + 1,5 kg")
- **2b — Soll/Bedarf** (abgeschlossen, Test ausstehend):
  - [x] Soll-/Mindestbestand je Artikel (stock_targets-CRUD, API /api/products/[id]/target)
  - [x] Soll-Ist-Vergleich (compareToTarget: ok/below_target/below_min/not_comparable) + Tests
  - [x] Bedarf-Indikator auf der Artikel-Detailseite + Soll-Modal
- **2c — Einkaufsliste + Inventur** (abgeschlossen, Test ausstehend):
  - [x] Bestandskorrektur/Inventur pro Artikel (tatsächlichen Gesamtbestand angeben, FIFO-Rückschreibung)
        — **G42:** editierbare Zwei-Schritt-Vorschau (Verteilung anpassbar), Korrektur auch nach oben (bestehende
        erhöhen ODER neue Zeile mit MHD), 0→verbraucht, Audit je Zeile (Undo-Basis), Refresh-Bug behoben.
  - [x] Einkaufsliste-UI: auto-Bedarf (Soll−Ist, auffüllen bis Soll) + manuelle Einträge + abhaken
  - [x] „Bedarf aus Beständen erzeugen" (Dedup: 1 auto-Eintrag/Artikel) + auto bei Inventur
  - [x] Einbuchen: Einkaufslisten-Eintrag → echter Bestand (easy-add vorbelegt, Eintrag danach entfernt)
- **2d — echte Bring!-API**: Login (verschlüsselte Credentials), Liste synchronisieren

### Markt-Fahrplan (M1–M4) — markt-gesteuerter Einkauf, Preise, Rezepte
- **M1 — Markt am Artikel (M:N)** (abgeschlossen, Test ausstehend):
  - [x] product_stores neu (M:N Artikel↔Markt „wo einkaufbar"), Migration 0008
  - [x] Query-Layer product-stores + API /api/products/[id]/stores
  - [x] Markt-Zuordnung (Chips) auf der Artikel-Detailseite
  - [x] auto-Bedarf nutzt product_stores (pro zugeordnetem Markt ein Eintrag; ohne = „egal")
  - [x] Einkaufsliste: Markt-Auswahl (dieser + „egal", kein Mischen); Einbuchen belegt aktiven Markt vor
- **M1-Feedback — Fixes, EAN am Artikel, Vererbung, Audit** (abgeschlossen, Test ausstehend):
  - [x] A1 Soll-Bestand-„Netzwerkfehler" behoben ($derived statt $state); A2 0,25er-Stepper; A3 „Orte"→„Räume"
  - [x] A4 mehr Einheiten-Vorschläge + Button-Ausblendung; A5 MHD-fehlt auffällig markiert; A6 Einheit-Vorauswahl aus Artikel
  - [x] B EAN/Barcode am Artikel (products.gtin UI-pflegbar, Unique-Konflikt → 409)
  - [x] C Markt/Ort-Vererbung: neuer Bestand erbt häufigsten Ort/Markt vorhandener Bestände (inventory-hints)
  - [x] D vollständiges Audit-Log (writeAudit in allen Schreib-Routen, Migration 0009 audit_log.household_id) + Seite /aktivitaet
- **M2 — Einkauf-Entität mit Status** (abgeschlossen, Test ausstehend): shopping_trips (begonnen/pausiert/beendet,
  max 1 aktiv je Haushalt) + shopping_trip_items (reserviert 1 Bedarf via UNIQUE); Reservierung „1 Bedarf = 1 Run"
  behebt das 2×2-Problem; „sichtbar aber gesperrt" in der Einkaufsliste + „In Einkauf legen"/Sammel-Aktion/verschieben;
  Ausverkauft-Status; Beenden blockiert bei nicht eingebuchten gekauften Positionen; eigene /einkauf-Seite;
  Split beim Einbuchen (N MHD-Zeilen). Migration 0010. Preise bewusst ausgeklammert → M3.
- **M3 — Preise je Artikel+Markt** (abgeschlossen, **auf Pi getestet ✓ 2026-07-18**): product_prices mit Historie (isCurrent =
  massgeblicher Preis; isReduced = Angebot, nur als Dauerpreis massgeblich); Preis pro Einheit mit toBaseFactor-Umrechnung;
  Kaufpreis beim Einbuchen (booked) + separate Pflege je Markt (manual, Detailseite); Estimate „ca. ~X €" + Summe +
  Warnung in Einkaufsliste (client-reaktiv) und Einkauf-Run (server). Migration 0011.
- **Einheiten-System v2** (abgeschlossen, Test auf Pi ausstehend) — Fundament (`units` + `lib/utils/stock.ts`):
  - **(a) Base-Klarstellung:** mass/volume waren via `toBaseFactor` bereits umrechenbar; „nicht vergleichbar" ist ein
    Artikel-Problem. Umgesetzt als UI-Klarstellung (count zeigt „Größe je Artikel (Gebinde)"). KEINE units.baseUnit-Spalte.
  - **(b) Gebinde-Größe je Artikel:** count-Einheit „Flasche" wird über `products.defaultVolumeMl`/`defaultWeightG` auf
    Volumen/Masse umgerechnet (PackSize/resolveUnitMeta in stock.ts; aggregateStock/compareToTarget/planInventoryAdjustment/
    estimateLineCost packSize-aware; Dual-Anzeige „3 Flasche (4,5 l)"). Editierbar auf der Detailseite. Keine Migration
    (Felder existierten seit 0000). Fallback = heutiges Verhalten. Commits d7b1adb…4d92f88.
- **F2 — Online-Preis-Abruf + Staging** (implementiert, Test auf Pi ausstehend): opt-in Preis-Abruf von Globus
  (DOM-Scraping, Best-Effort; Penny ohne offene Quelle). **Staging-Phase:** abgerufene Preise landen NICHT direkt als
  isCurrent, sondern als `proposed` (product_prices.status) → User übernimmt/korrigiert/verwirft, erst dann massgeblich.
  Kern-Invariante `status != 'confirmed' ⇒ isCurrent = false`. Migration 0012 (status + proposed_uniq + stores.scrapeUrl).
  Env-Toggle `PRICE_SCRAPE_ENABLED` (default AUS), failsafe (8s Timeout, jeder Fehler → null, kein 5xx bei Miss).
  Einzel- + Sammel-Abruf. Sammel-Abruf ist Gerüst (eine URL je Markt; artikelspezifische URL folgt später).
- **M4 — Rezepte + Personen/Portionen** (geplant): recipes/recipe_ingredients/recipe_steps, persons,
  Zutaten-Ampel via aggregateStock/compareToTarget, fehlende Zutaten → Einkaufsliste.

### Weitere geplante Features (aufgenommen 2026-07-18, Reihenfolge offen)
- **Angezeigter Name = Haushalt „Die Merbotts"** (**erledigt G52, auf Pi getestet ✓ 2026-08-14**): Der oben rechts
  angezeigte Name kommt aus `users.display_name` des ältesten Nutzers (Kette `display_name` → `rowToBypassUser` →
  `data.user.name` → Navbar). Reiner DB-Wert, kein Code. Fallstrick: `getBypassUser()` cached prozessweit → Änderung
  greift erst nach `docker compose up -d --force-recreate stoqr` (nicht `restart`, nicht Browser-Reload).
- **Gefahrenzone — dreistufiger Werksreset** (**erledigt G53, auf Pi getestet ✓ 2026-08-14**): Einstellungen → Danger
  Zone mit drei Stufen: **A** = nur Bestände (`inventory_items`), **B** = + Artikel & Preise (`products` global hart +
  `product_*`/`product_prices`/`product_stores`/`stock_targets`/`globus_snapshots`), **C** = kompletter Werksreset
  aller Inhaltsdaten (zusätzlich Einkaufslisten/-käufe, Orte/Lager/Märkte via `locations`-Cascade, eigene Einheiten,
  `category_mappings`/`expiry_config`/`audit_log`/`invites` sowie Referenzdaten `categories`/`nutrient_types`).
  Alle Löschungen children-first in **EINER Transaktion** (RESTRICT-FKs). GitHub-artige Type-to-Confirm (feste Phrase
  je Stufe, serverseitig erneut geprüft) + Modal = 2-Stufen-Bestätigung. Nutzer/Haushalt/Sessions bleiben erhalten,
  man bleibt eingeloggt. **Stufe C mit Auto-Re-Seed:** Kategorien + Nährwert-Typen werden am Ende **derselben
  Transaktion** aus `categorySeeds`/`nutrientTypeSeeds` (über `@stoqr/db` re-exportiert) wieder auf Werkszustand
  eingespielt — **kein manuelles `psql -f /seed.sql`** mehr nötig, echter Frischstart ohne Nachpflege. Keine Migration.
- **Reichere Globus-Daten (Stufe 1)** (**erledigt G44, auf Pi getestet ✓ 2026-08-13**): Grundpreis (PAngV, „0,19 €/l") aus
  dem Suggest-HTML + Detailseiten-JSON-LD (brand/description/offers) abgerufen; `product_prices.base_price_ct/unit`;
  volles Detail-HTML archiviert (`globus_snapshots.raw_detail_html`) + Feld-Landkarte (`extracted`: Feld/Wert/Quelle/
  Zugehörigkeit) im Katalog-Spiegel sichtbar. Migration 0020. **Stufe 2 (offen):** Headless-Chromium (Playwright) für
  JS-gerenderte Felder (exakter Pfandbetrag, Nährwerte) — Dockerfile-Umbau Alpine→Debian/`apk chromium`, arm64/non-root.
- **Pfand / Leergut** (**erledigt G47–G50, auf Pi getestet ✓ 2026-08-13**): Pfand am Artikel (`has_deposit` + `deposit_ct`,
  Schnellwahl 0,08/0,15/0,16/0,25 € + frei, Herkunfts-Schutz); Preis-Flag `price_includes_deposit` (Fallback); Estimate
  weist Ware + Pfand getrennt aus (Einkaufsliste/Einkauf), Pfand je Stück (mass/volume nur mit Gebinde, sonst Hinweis);
  Katalog-Sicherung schlägt Pfand ja/nein aus dem JSON-LD vor. **Exakter Betrag aus dem Abruf = Stufe 2 (Headless).**
  ggf. Leergut-Verknüpfung.)
- **Einkäufe umbenennen** (**bereits umgesetzt** — Feststellung 2026-07-24): Umbenennen-UI existiert auf
  `einkauf/[id]` (Button + Input + `saveRename` via PATCH `{name}`); PATCH-Route akzeptiert `name`. Kein offener Task.
- **Inventar-Ansicht „Artikel" (Toggle)** (**erledigt G39, Test auf Pi ✓**): `/inventar` hat einen
  Umschalter „Nach Artikel ↔ Einzelbestände" (Default = Artikel, in localStorage gemerkt). Die Artikel-Ansicht
  aggregiert Bestände je Artikel (Accordion: Icon + Name + EAN + Gesamtmenge + Anzahl + frühestes MHD; aufgeklappt die
  einzelnen Bestände). Reiner Helfer `lib/utils/inventory-group.ts` über `aggregateStock`/`buildPackSize`. Bestehende
  Filter greifen; MHD-Ampel nutzt `expirySettings` statt Hardcodes.
- **„Verbraucht"-Handling + Wiederherstellen** (**erledigt G41, auf Pi getestet ✓ 2026-08-13**): `consumedAt` wird jetzt bei
  jedem Statuswechsel gepflegt (in `updateInventoryItem`); „Wiederherstellen" (zurück auf `available`, bei Menge 0 mit
  Mengen-Abfrage) im Kontextmenü + auf der Detailseite; „Verbraucht vor X Tagen" neben dem Status-Badge
  (`lib/utils/relative-time.ts`). Nicht-verfügbare Bestände bleiben unbegrenzt sichtbar (kein Zeitfenster/Cleanup).
  Der „Nur verfügbare"-Toggle war entgegen der alten Notiz bereits funktional (seit G8-5).
- **Günstigster-Preis-Hinweis (Einkaufsliste)** (**erledigt G46, auf Pi getestet ✓ 2026-08-13**): reiner Helfer
  `lib/utils/price-compare.ts` — Vergleich pro Basiseinheit, **Grundpreis (G44) bevorzugt**, sonst Eigenrechnung;
  Angebote zählen mit; nur vergleichbare Einheiten. Anzeige: Badge „günstigster" auf der Artikel-Detailseite
  (Preise-Card) + Hinweis „günstigster: {Markt}" je Einkaufslisten-Zeile. Nicht vergleichbare Einheiten → Hinweis
  statt Marker.
- **EAN auf der Artikel-Übersichtsseite anzeigen** (klein, Konsistenz): EAN/Barcode ist in Einstellungen→Artikel sichtbar,
  aber nicht auf `/inventar`. Dort ebenfalls anzeigen (analog Einstellungen-Artikel-Zeile).
- **Doku-Notiz EAN-Identität vs. Katalog-Diff** (klein, aufgenommen 2026-07-21): festhalten, dass eine EAN/GTIN global
  genau EIN Produkt identifiziert (GS1) — verschiedene Gebinde (1 l / 1,5 l, Glas vs. PET) haben je eine EIGENE EAN,
  sind also verschiedene Artikel. Der Katalog-Diff (snapshot-diff) vergleicht bewusst Name/Bild/Kategorie/Preis, NICHT
  die EAN: Feld-Änderungen und EAN-Identität sind orthogonale Achsen. Preis/Verfügbarkeit sind markt-abhängig
  (product_prices/product_stores), das Produkt selbst ist global. (Klärung aus G16-Test — kein Code, nur Doku.)
- **Erledigt in G16 (2026-07-21):** Modal schließt nicht mehr beim Text-Markieren; Nährstoffe hierarchisch sortiert
  (Parents → eingerückte Children); Herkunft-Badges immer sichtbar; easy-add zeigt Feld-Herkunft.
- **Gebinde-Nesting — verschachtelte Einheiten je Artikel** (Backlog, aufgenommen 2026-07-21 aus G19): Bsp. „1 Packung
  enthält 18 Riegel à 21 g". Heute kennt der Artikel nur EINE Gebinde-Stufe (`defaultVolumeMl`/`defaultWeightG` → PackSize,
  s. Vererbungs-Tabelle). Ziel: 2-stufige Kette Packung → Stück (n) → Basis-Menge (g/ml) je Stück. **Minimal-Variante:**
  zusätzliche Felder `unitsPerPack` + Basis-Menge je Einheit; Aggregation/Estimate/Soll-Ist rechnen die Kette durch
  (18 × 21 g = 378 g je Packung). **Größter Nutzen bei „Alle angleichen…"/convert** (eine Packung → 378 g umrechenbar) und
  im Preis-Estimate pro Basiseinheit. Fallback ohne Nesting = heutiges Ein-Stufen-Verhalten. Migration additiv
  (Nullable-Felder, kein Backfill). Kein UI-Zwang — nur wo der Artikel eine Sub-Stückelung hat.
- **Kategorie-System-Ausbau (gestuft): CRUD → Nesting → Mapping-Regeln** (in Arbeit seit 2026-07-21): das schwache
  Auto-Mapping (nur wenige Katalog-Pfade treffen die 9 flachen Seed-Kategorien) wird gelöst, indem der Nutzer das
  Kategorie-System selbst pflegt. **Stufe 1 (G24, erledigt): Kategorie-CRUD** — Einstellungen → Kategorien: anlegen/
  umbenennen/löschen; Seed-Kategorien löschgeschützt; in-use-409 bei zugeordneten Artikeln/Unterkategorien.
  **Stufe 2 (G27, erledigt): Nesting** — `parent_id` aktiviert, beliebig tief mit Zyklus-Schutz (isDescendant),
  eingerückte Baum-Dropdowns + ↳-Symbol bei Unterkategorie-Werten. **Stufe 3 (G29, erledigt): Mapping-Regeln** —
  Tabelle `category_mappings` (OFF-Tag/Globus-Segment → Kategorie, household-scoped, Migration 0019), greift
  automatisch bei Scan + Sync vor dem Code-Fallback; Verwaltungsseite `Einstellungen → Kategorie-Zuordnung` +
  Schnell-Regel im Katalog-Spiegel. Vorrang: manuell (G20-2) > Regel > Code-Fallback. **Kategorie-Ausbau abgeschlossen.**
  Manuelles Überschreiben pro Artikel bleibt (G20-2/G22-1).
- **Design-Schuld — categories global:** `categories` hat kein `household_id` (9 Seed-Kategorien global, `slug` unique).
  Kategorie-CRUD (G24) wirkt daher haushaltsübergreifend. Bei einem Haushalt unkritisch; bei Multi-Household später auf
  household-scoped Kategorien umstellen (analog [[stoqr-ean-global-unique]]).

### Kreislauf (Zielbild)
Inventur (Ist erfassen) → Soll-Ist-Bedarf → Einkaufsliste (virtuelle Bestände) → Einkauf → Einbuchen
(echter Bestand mit Marke/MHD/Markt/Ort). Basis für (Semi-)Automatisierung.

### Einstellungen (Verwaltung)
- [x] Einheiten-Verwaltungsseite mit Umrechnung (Dimension + Faktor) + Vorschlägen gängiger Einheiten

### Inkrement 3 — Komfort
- [ ] Dubletten-Vermeidung (Konzept offen — siehe Changelog)
- [x] Nährwerte dynamisch editierbar (Editor + eigene Nährstofftypen) — Feedback-Runde 1
- [ ] Nährwerte per OCR erfassen
- [~] Mobile-first Feinschliff (globaler + seiten-spezifischer Sweep, Feedback-Runde 1)

---

## Offene Punkte / noch zu testen (nicht bestätigt)

> **✅ Baseline 2026-08-14 — Test-Manifest A–E vollständig grün (auf Pi getestet):** Der Tester hat den kompletten
> Durchlauf **A–E, 214/214 Punkte, als getestet und funktional bestätigt** (Stand Commit `7c2d49c`,
> `ghcr.io/labushuya/stoqr:main`), inklusive des neuen Namens „Die Merbotts" (G52) und der Gefahrenzone mit
> dreistufigem Werksreset (G53) — Stufe C setzt jetzt auch die Referenzdaten (Kategorien + Nährwert-Typen)
> **automatisch** wieder auf Werkszustand (Auto-Re-Seed in derselben Transaktion), **kein manuelles `seed.sql`**
> mehr nötig. **Alle unten mit „Test auf Pi ausstehend" markierten G-Blöcke bis einschließlich G53 gelten damit als
> bestätigt** — die Einzelvermerke sind historisch und werden bewusst NICHT rückwirkend umgeschrieben (sie
> dokumentieren den Zustand zum Zeitpunkt des jeweiligen Commits). Es gilt das **Per-Turn-Handover-Format**
> (siehe unten „Handover-Prozess pro Test-Turn").
>
> ### Handover-Prozess pro Test-Turn (verbindlich ab Baseline 2026-08-13)
> Jeder künftige Test-Manifest-Turn endet mit **genau einem Commit**, dessen CHANGELOG-Eintrag drei Dinge festhält,
> damit jede fremde LLM-Instanz nahtlos übernehmen kann (Format-Vorlage: `docs/chatgpt-handover-prompt.md §12`):
> - **(a) Was war geplant** — Ziel/Erwartung des Turns (aus Test-Manifest-Notiz oder User-Auftrag).
> - **(b) Was wurde umgesetzt** — Dateien/Funktionen/Invarianten + Migrationshinweis + Gate-Ergebnis.
> - **(c) Was hat nicht funktioniert / wo gab es Probleme** — bestätigte Bugs, Root-Cause, Regressionen, offene Reste
>   inkl. Testergebnis (pass/fail je relevantem Manifest-Punkt). Kein „grün ohne Beleg".
>
> So wandert das bisher nur im Browser-localStorage des Testers lebende Testergebnis dauerhaft ins Repo.

**Auth deaktivierbar (`AUTH_DISABLED`) — Test auf Pi ausstehend:**
- Login lässt sich per ENV-Flag `AUTH_DISABLED=true` komplett abschalten; die App lädt dann direkt als der (erste)
  vorhandene Nutzer/Haushalt, „Abmelden" ist ausgeblendet, `/login` leitet auf `/` um. Bypass in `hooks.server.ts` +
  `lib/server/auth-bypass.ts`; DB-Schema/Better-Auth/Guards unangetastet, voll reversibel (Flag entfernen → Login zurück).
  Leere DB fällt bewusst auf Login zurück, damit `/register` erreichbar bleibt. Details: CHANGELOG-Eintrag.

**G9 — Katalog-Regressionsfixes — Test auf Pi ausstehend:**
- **G9-1:** „Katalog jetzt sichern" → die Vorschläge werden wieder angezeigt (Regression behoben); Übernehmen/Verwerfen aktualisiert die Liste.
- **G9-2:** Malformed/fehlende Markt-URL → Hinweis „Kein Markt mit gültiger Abruf-URL"; echte 0-Treffer-Fälle (gültige URL, nichts gefunden) → „Struktur evtl. geändert".
- **G9-3:** Artikel aus Globus-Katalog anlegen → Name, Bild UND Kategorie werden übernommen; das Bild erscheint auch im „Ausgewählt"-Pill.

**G8 (Migration 0016) — Test auf Pi ausstehend:**
- **G8-1:** Katalog sichern → Snapshot mit Bild → „Übernehmen" (Bild angehakt) → Artikel-Detailseite zeigt das Bild; Name/Kategorie nur wenn angehakt/leer. Ohne Artikel-Match: „Übernehmen" gesperrt.
- **G8-2:** easy-add mit Markt → Artikel-Detailseite zeigt den Markt als Bezugsquelle-Chip; nächster Bestand hat den Markt vorbelegt.
- **G8-3:** Update-Check nennt die konkrete Ursache (z.B. „kein Internetzugang zu GitHub").
- **G8-4:** Migration 0016 (pg_trgm/GIN, failsafe); beim Anlegen nach „mineralwasser" suchen → „Aus Globus-Katalog"-Treffer mit Bild; Auswahl legt Artikel an. Live-Suggest nur einmalig bei wenig lokalen Treffern + aktivem Abruf.
- **G8-5:** Einkauf umbenennen persistiert; EAN auf /inventar sichtbar; „Nur verfügbare"-Toggle wirkt (verbrauchte ein-/ausblenden).

**G7 — Katalog-Snapshots + Bilder + Backup + Gebinde-Einheit (Migration 0015, Volume stoqr_media) — Test auf Pi ausstehend:**
- Container-Neustart → Migration 0015 (Tabelle globus_snapshots), `/data/media` beschreibbar (entrypoint mkdir), Volume `stoqr_media` gemountet.
- **Gebinde:** Artikel mit count-Standard-Einheit → „Gebinde festlegen" → 40 + „Gramm (g)" → Anzeige „1 Packung = 40 g" (nicht 0,04 kg); 1,5 + „Liter (l)" → „1,5 l".
- **Sync:** Online-Preis-Abruf aktiv + Globus-Markt mit Suggest-URL, Artikel mit EAN zugeordnet → Einstellungen → „Katalog jetzt sichern" → Vorschläge (Name/Kategorie/Preis/Bild) erscheinen; Bild-Thumbnail lädt über /media. Erneuter Sync ohne Änderung → „unverändert". Geänderter Wert → neuer Vorschlag.
- **Review:** Snapshot „Übernehmen"/„Verwerfen" → verschwindet aus der Liste; /aktivitaet zeigt die Übergänge.
- **Struktur-Check:** bei 0 Treffern trotz vorhandener EANs → Warnung „Globus-Struktur evtl. geändert".
- **Failsafe:** kein Bild / Netzwerkfehler bei einzelnen Artikeln → Sync läuft durch (skipped/failed), kein Crash.

**G6 — Einheiten-Fixes — Test auf Pi ausstehend:**
- Preisvorschlag nutzt die Einheit der vorhandenen Bestände (z.B. „Packung"), nicht mehr eine alte custom-Einheit („blihn").
- Artikel-Detailseite: „Standard-Einheit" ist jetzt per Selektor änderbar (behebt den eingefrorenen defaultUnit).
- „Alle angleichen…"-Dialog: Zieleinheit wählen, Modus „nur umbenennen" oder „Menge umrechnen" (mit Beispielen). Setzt Artikel + alle Bestände (auch verbraucht/gespendet/entsorgt) auf die Einheit; convert rechnet 500 g→0,5 kg, bei Stückzahl nur umbenennen.

**Geplant (noch nicht gebaut) — G7: Globus-Katalog-Snapshot + Bilder + Backup:** eigene Tabelle `globus_snapshots`
(append-only, status proposed/confirmed/rejected, volle JSON-Historie + Approval wie Preise); Produktbilder als Datei in
neues Docker-Volume (`stoqr_media`, DB nur Pfad); Katalog-Sync + Struktur-Check in Einstellungen; speist später
Nährwerte/Allergene/Preise. Parser um category/currency/imageUrl/rawJson erweitern. (Nach G6-Test, eigener Plan.)

**G5 — Globus-Scraper (Suggest-Endpunkt) — Test auf Pi ausstehend:**
- Markt „Globus" → Abruf-URL `https://produkte.globus.de/hockenheim/suggest?search={EAN}` (Anleitung im Feld).
- Artikel mit realer, bei Globus geführter EAN (z.B. Mineralwasser Classic 4306188415978) → „Online abrufen" → Preis-Vorschlag 0,29 € erscheint.
- Artikel mit EAN, die Globus nicht führt → „Kein Onlinepreis gefunden" (kein Crash) — das ist korrektes Verhalten, kein Bug.
- Sammel-Abruf je Markt → Vorschläge für alle geführten EANs; nicht geführte → skipped.
- Danach F2-3…10 aus dem Test-Manifest (Übernehmen/Korrigieren/Verwerfen/Audit) durchspielbar.
- Toggle-Erfolg: „✓ gespeichert" erscheint kompakt neben dem Schalter (kein fehlplatziertes Banner).

**G4 (Migration 0014) — Test auf Pi ausstehend (behebt F2-Testblocker + G2-Fehlinterpretation):**
- **In-App-Schalter:** Einstellungen → „Online-Preis-Abruf" → Schalter AN → Abruf-UI erscheint (kein Env-Setzen mehr). AUS → Buttons weg, API 403.
- **Markt-URL mit `{EAN}`:** Markt bearbeiten → Abruf-URL `https://produkte.globus.de/hockenheim/search?query={EAN}` (Anleitung/Muster sichtbar). Keine „Filiale/Region" mehr. Pflicht: Name + Adresse + Stadt (Kette optional).
- **Abruf:** Artikel mit EAN → „Online abrufen" → {EAN} wird durch die EAN ersetzt, Vorschlag erscheint (dann F2-3..10 wie im Test-Manifest durchspielbar).
- **URL-Bug:** gültige URL → auf „abc" ändern → wird abgelehnt und bleibt abgelehnt (nicht mehr fälschlich „gültig").
- **Adressfeld:** sieht aus wie die anderen Felder (Icon links), OSM-Vorschläge auswählbar (auch per Klick/Touch).
- **Dark Mode:** Kalender-Symbol in MHD-Feldern sichtbar.

**G1/G2 (Migration 0013) — Test auf Pi ausstehend:**
- **G1-1:** Bestand auf der Detailseite per „Bearbeiten" verringern → Gesamtbestand oben SOFORT aktuell (ohne Refresh); ebenso nach Verbraucht/Gespendet/Entsorgt/Entfernt.
- **G1-2:** Bestand mit Kaufpreis anlegen → Detailseite → „Bearbeiten" zeigt Kaufpreis-Feld, änderbar, bleibt nach Speichern (auch nach Refresh); Anzeige „Kaufpreis X €" in der Bestandszeile.
- **G2 Pflichtfelder:** Markt ohne Adresse/Stadt/Region anlegen/bearbeiten → Fehlermeldung; Kette leer lassen → OK. Bestehende Märkte bleiben nach Migration ladbar.
- **G2 OSM:** Im Markt-Formular Adresse tippen → OSM-Vorschläge; Auswahl füllt Adresse + Stadt (+ Koordinaten). Manuelle Eingabe weiter möglich; Netzwerkfehler → keine Vorschläge, kein Absturz.
- **G2 Globus:** Markt „Globus" mit Filiale „hockenheim", Artikel mit EAN → „Online abrufen"/Sammel-Abruf → Preis-Vorschlag über Search-URL. Artikel ohne EAN → sauber übersprungen (skipped), kein Fehler. `scrapeUrl`-Override (falls gesetzt) gewinnt weiter.

**F2 — Online-Preis-Abruf + Staging (Migration 0012) — Test auf Pi ausstehend:**
- Container-Neustart → Migration 0012 läuft (status/scrape_url/proposed_uniq); Bestandspreise bleiben `confirmed`/isCurrent
- Feature AUS (`PRICE_SCRAPE_ENABLED` ungesetzt): kein „Online abrufen"-Button, API-Fetch → 403
- Markt „Globus" → Abruf-URL hinterlegen (Einstellungen→Märkte, „Online-Abruf aktiv"-Badge)
- Feature AN: Detailseite → „Online abrufen" → Vorschlag-Badge, fließt NICHT ins Estimate; Übernehmen→maßgeblich,
  Korrigieren→editierter Wert, Verwerfen→weg (Historie); erneuter Abruf → nur 1 offener Vorschlag
- Tote/ungültige URL, Timeout, geändertes HTML → Toast „Kein Online-Preis gefunden", kein Crash/5xx
- Sammel-Abruf (Einstellungen→Märkte) → Aggregat-Toast „X Vorschläge, Y übersprungen"; /aktivitaet zeigt die Übergänge

**Einheiten-System v2 (Commits d7b1adb…4d92f88) — auf Pi getestet ✓ 2026-07-18 (Test-Manifest vollständig, keine Auffälligkeiten):**
- Artikel mit count-defaultUnit „Flasche" → Detailseite → Gebinde „1,5 l" festlegen
- 3 Flaschen → Gesamtbestand „3 Flasche (4,5 l)"; Soll „6 l" vergleicht korrekt (kein „nicht vergleichbar")
- Preis „0,29 €/Flasche" → Estimate gegen Bedarf in l fair; Fallback ohne Gebinde = wie bisher
- Einstellungen→Einheiten: count zeigt „Größe je Artikel (Gebinde)"

**Block F / M3 — Preise (Commits 9bf1950, 6c5b0bd, bbea93d, 1351586, 8fbba90, 19579b0, 828c174; P1-Fix 050fad3) — auf Pi getestet ✓ 2026-07-18 (Test-Manifest vollständig, keine Auffälligkeiten):**
- Migration 0011 (product_prices, Unique-Index product_prices_current_uniq)
- Einbuchen mit Preis → purchasePriceCt am Bestand + Preis-Eintrag; Detailseite-„Preise"-Card zeigt ihn
- reduziert ohne Dauerpreis → Estimate nutzt weiter regulären Preis; „als Dauerpreis" → neuer maßgeblicher Preis
- Preis je Markt manuell auf der Detailseite setzen
- Einkauf-Run/Einkaufsliste (Markt gewählt) → „ca. ~X €" pro Position + Summe + Warnung; ohne Markt „Markt wählen"
- Einheiten: 1,50 €/kg bei 500 g → 0,75 €; Preis/Packung vs. Bedarf in kg → „Einheit ≠"

**Block E / M2 — Einkauf-Entität (Commits 9a05157, d6b6f10, cc95666, 4775eda, 9482a9e, d327598, 01bc69e, 47a1ce9) — Test auf Pi ausstehend:**
- Migration 0010 läuft (shopping_trips + shopping_trip_items, beide Unique-Indizes)
- 2×2 behoben: Milch bei Globus+Penny, 2× Soll → einen dem Globus-Run zuweisen → in Penny-Ansicht ausgegraut „reserviert"
- Status: zweiter Run pausiert den ersten; Beenden blockiert bei nicht eingebuchter „gekauft"-Position
- Verschieben zwischen Runs; Ausverkauft → beim Beenden zurück in Backlog
- Split beim Einbuchen (×2/×3/×4) → mehrere Bestände mit je MHD; Bedarf + Position verschwinden
- Sammel-Aktion „Alle in Einkauf legen"; /aktivitaet zeigt Einkauf-Einträge

**M1-Feedback A–D (Commits 77b3e6e, 97a3462, 40798b6, 4d3a374, 832dfee, 9000b61, cc1674f, c094739, 82ce904) — Test auf Pi ausstehend:**
- Migration 0009 läuft (audit_log.household_id)
- A1: Soll mit Mindestbestand speichern → kein „Netzwerkfehler"; A2: Stepper 0,25, freie Eingabe „1,3"; A3: „Räume" überall
- A4: neue Einheiten-Vorschläge; Button weg wenn alle da; A5: Bestand ohne MHD orange/gestrichelt; A6: Einheit aus Artikel-defaultUnit vorbelegt
- B: Artikel mit EAN anlegen/ansehen/bearbeiten; doppelte EAN → 409-Meldung
- C: zweiter Bestand desselben Artikels → Markt/Ort vorbelegt
- D: Änderung an Artikel/Bestand/Soll → /aktivitaet zeigt Vorher→Nachher, User, Zeit

**Inkrement M1 — markt-gesteuerter Einkauf (Commits 903350c, 6706fa4, 4f7db1a, 46a59e4, 27c5bff, 6744f65) — Test auf Pi ausstehend:**
- Migration 0008 (product_stores neu) läuft; Artikel-Detailseite → Märkte-Chips zuordnen
- „Bedarf erzeugen" legt pro zugeordnetem Markt einen auto-Eintrag an; Artikel ohne Markt = „egal"
- Einkaufsliste: Markt „Globus" wählen → nur Globus-Bedarf + markt-lose sichtbar; Penny ausgeblendet
- „Einbuchen" bei gewähltem Globus → easy-add hat Markt „Globus" vorbelegt

**Inkrement 2c (Commits 442a48d, 1c65424, dc9de60, 7a43b54, ab29d68, ece8652) — Test auf Pi ausstehend:**
- Inventur: Artikel mit Soll → „Bestand korrigieren" auf niedrigeren Ist → Bestände FIFO reduziert, Bedarf-Eintrag entsteht
- Einkaufsliste: auto-Eintrag sichtbar; manuell hinzufügen/abhaken/löschen; „Bedarf erzeugen" ohne Duplikate
- Einbuchen: „Einbuchen" → easy-add vorbelegt → speichern → Listeneintrag weg, neuer Bestand auf /inventar

**Einheiten-Seite + Inkrement 2b (Commits 34e4b4f, 4ff5490, 0b5b446, d0ee0ed, 0394380) — Test auf Pi ausstehend:**
- Einstellungen → Einheiten: Custom-Einheit mit Dimension+Faktor anlegen/bearbeiten/löschen; Vorschlag (z.B. EL) per Klick übernehmen; System-Einheiten read-only; benutzte Einheit löschen → 409
- Artikel-Detailseite: Soll festlegen (Menge+Einheit+optional Min); Bedarf-Indikator (grün ok / gelb unter Soll / rot unter Min / grau nicht vergleichbar); Soll entfernen

**Inkrement 2a + FAB-Angleich (Commits 0efec01, de024bf, 3594c0f, 72669a9, 849b013) — Test auf Pi ausstehend:**
- Migration 0007 läuft sauber (units.dimension + to_base_factor gebackfillt)
- FAB „Neuer Artikel" + „Bestand hinzufügen" gleich groß
- Artikel-Detailseite zeigt Gesamtbestand (gemischte Einheiten z.B. „2 Packung + 1,5 kg"); consumed zählt nicht mit

**Feedback-Runde 2 (Commits 7c81cf7, 6effef4, edccb4f, b62b64d, ec8acc7, f0e3a58) — Test auf Pi ausstehend:**
- Einstellungen → Artikel: nur Name + Kategorie (add + edit + Anzeige)
- Inventar 3-Punkt: ein „Bearbeiten" → Detailseite (kein Sheet-Edit, kein toter Hash)
- Modal-Konsistenz: Neuer Artikel / Lagerort-Picker / Bestätigungen = gleiches Modal
- Nährwert-„+"-Zeile als placeholder-artiger Slot
- Mobile: Modals sauber, kein Overflow

**Feedback-Runde 1 (Commits e4d4b4c, 3b79517, da07d91, 6d9bfa8, c83f1cc, ace56ed, 035b911, 5c382c2) — Test auf Pi ausstehend:**
- Einheit: "Packung" bleibt "Packung" (Anzeige + Speichern); Feld = Dropdown
- Nährwert-Editor: Zeile add/ändern/löschen persistent; eigener Nährstoff anlegbar; Seed-Nährstoffe korrekt beschriftet
- Aggregierte Detailseite: alle Bestände eines Artikels sichtbar; Inline-Edit (Menge/MHD/Markt/Ort) je Bestand persistent
- Bezugsquelle je Bestand editierbar; keine Bezugsquellen-UI-Reste
- Mobile 360–480px: kein Overflow, Felder/FAB sauber

**Inkrement 1 (Commits 9689107, f57688d, 7f651bb, 6b3ba93, 58115ce, 36bfa8d) — Test auf Pi ausstehend:**
- Migration 0005 + 0006 laufen sauber (Testdaten-Reset der Bestände)
- „Neuer Artikel" legt nur Stammdaten an (kein Bestand)
- Einstellungen → Artikel: Liste, anlegen, bearbeiten, löschen (409-Schutz bei Beständen)
- „Bestand hinzufügen": EAN-Scan → Artikel-Vorschlag, Markt-Dropdown, Notiz
- Bestand trägt EAN + Markt + Ort; erscheint auf /inventar

**Ältere, noch nicht bestätigte Punkte:**
- Realtime Name-Update nach Bearbeiten (Commit 78e7e5e)
- „Alles löschen" / „Aus Katalog entfernen" direkt im 3-Dot-Menü (Commit 78e7e5e)
- Kategorie-Emoji in Suche (Commit 808ae64)
- Custom-Unit-Umbenennung propagiert zu Artikeln (Commit 7da27e1)

## Dubletten-Vermeidung — Vorschlag (Entscheidung ausstehend)
Da EAN jetzt am Bestand liegt und Artikel universell sind:
- Beim Artikel-Anlegen: Fuzzy-Name-Suche → "Ähnlicher Artikel existiert: Vollmilch. Trotzdem neu anlegen?"
- Kein harter EAN-Dedup mehr auf Artikel-Ebene (EAN ist ja am Bestand)
- Bestände können optional per EAN einem Artikel vorgeschlagen werden

## Bekannte Design-Schulden (später, wenn relevant)
- **EAN global unique:** `products.gtin` hat einen globalen Unique-Constraint (`products_gtin_unique`, Migr. 0000)
  über ALLE Haushalte. Artikel sind bewusst global/geteilt (kein household_id). Solange nur ein Haushalt real
  genutzt wird, unkritisch. Sobald mehrere Haushalte relevant werden: eine von A anzulegende EAN, die B schon
  nutzt, wird blockiert („Diese EAN ist bereits einem anderen Artikel zugeordnet."). Optionen dann: household-scoped
  products + `unique(gtin, householdId)`, oder EAN-Konflikt nur innerhalb des eigenen Haushalts prüfen (Query statt
  DB-Constraint). Entscheidung offen. (vermerkt 2026-07-14)
