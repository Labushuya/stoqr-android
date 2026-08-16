# Changelog

Alle nennenswerten Änderungen an stoqr. Format lose an [Keep a Changelog](https://keepachangelog.com).
Neueste Einträge oben. Jeder Eintrag nennt den Commit-Kontext, damit andere LLMs nahtlos ansetzen können.

---

## [0.1.0] — stoqr Android: eigenstaendige Offline-App (Phase 1)

Erster Release des **stoqr-android**-Forks: stoqr laeuft jetzt als vollstaendig **eigenstaendige,
offline nutzbare Android-App**. Kein Online-Zwang, kein Pi noetig. Die App bringt alles selbst mit
(On-Device-Datenbank, Seeds, Barcode-Scan) und kann in einer spaeteren Version bei Bedarf
**bidirektional** mit der Pi-Instanz abgeglichen werden — das fuehrende System ist dann waehlbar.

Der Pi-Betrieb (SvelteKit + Postgres + Docker) im urspruenglichen stoqr-Repo bleibt unveraendert.
Die vollstaendige Feature-/G-Block-Historie dieses gemeinsamen Codes steht weiter unten (alles vor
dem Fork). Dieser Eintrag beschreibt nur, was der Android-Fork ergaenzt.

**(a) Ziel:** Eine Android-App, die alles mitbringt, komplett offline funktioniert und sich unabhaengig
von der Pi-Version nutzen laesst. Pi- und App-Version arbeiten getrennt; ein optionaler Abgleich folgt.

**(b) Umgesetzt (Phase 1):**
- **Capacitor-Huelle** um die bestehende Svelte-5-UI als SPA (adapter-static). Kein UI-Rewrite —
  dieselbe Oberflaeche wie auf dem Pi. Dual-Target-Build ueber `STOQR_TARGET` (node=Pi | app=Android).
- **On-Device-SQLite** (`@capacitor-community/sqlite` + Drizzle SQLite-Driver) als Datenschicht.
  Vollstaendiger Schema-Spiegel aller Tabellen (`packages/db/src/schema.sqlite.ts`), Dialekt-sauber
  (uuid→text, boolean/timestamp→integer, numeric→text) mit Parity-Test gegen das Postgres-Schema.
- **Query-Schicht entkoppelt:** die Query-Funktionen bekommen `db` per Provider (`getDb()/setDb()`)
  injiziert statt es zu importieren — dieselben Funktionen laufen gegen Postgres (Pi) oder SQLite (App).
- **Client-Datenzugriff:** ein `apiFetch`-Shim ersetzt `fetch('/api/...')` signaturgleich; im App-Bundle
  fuehrt ein lokaler Router die Anfrage direkt gegen SQLite aus (kein Netz, kein lokaler Server).
- **First-Launch-Seeding:** lokaler Haushalt + Bypass-Nutzer, Kategorien, Naehrwert-Typen und
  System-Einheiten werden beim ersten Start automatisch eingespielt (Guard-Tabelle `meta`).
- **OCR in-browser vorbereitet:** die reinen MHD-Datumsparser sind nach `lib/utils/mhd-parse.ts`
  extrahiert (getestet), damit Tesseract on-device laufen kann.
- **Offline-Login:** feste lokale Identitaet (kein Better-Auth-Netzcode), analog zum Pi-Bypass.
- **Sync-Fundament (nur Vorbereitung, kein Netzcode):** clientseitige IDs (`crypto.randomUUID`);
  Einstellungen → Abschnitt **„Sync"** mit **waehlbarem fuehrendem System** (App | Pi) + optionaler
  Pi-URL. Ohne gepflegte Pi-URL gilt die App als Standalone und ist selbst das fuehrende System.
  In Phase 1 wird die Auswahl nur gespeichert (lokale `meta`), noch ohne Wirkung.
- **GitHub Actions:** `ci.yml` (Gate: lint/typecheck/test + SPA-Build-Check, ohne Postgres) und
  `release.yml` (Tag `v*`: Gate → SPA-Build → `cap sync` → Gradle `assembleRelease`, signiert per
  `ANDROID_KEYSTORE_BASE64`-Secret, APK am GitHub-Release). Release-Manifest: CAMERA,
  REQUEST_INSTALL_PACKAGES.

**(c) Bewusst NICHT in Phase 1:** kein Sync-Netzverkehr / keine `/api/sync/*`-Endpunkte, keine
Konfliktaufloesung, keine `rev`/Tombstone-Migrationen (Phase 2-4), keine Aenderung am Pi-Repo, kein iOS.

**(d) Verifikation:** Gate gruen (typecheck/lint/test), `STOQR_TARGET=app`-Build erzeugt das statische
SPA-Bundle ohne SSR-Fehler; Emulator-/Geraetetest offline (Anlegen, Barcode-Scan, Persistenz nach
Neustart). Test-Manifest: neuer Block **G54** „stoqr Android Offline-App (Phase 1)".

---

## [Unreleased] — vor dem Fork (gemeinsame Pi-Historie)

Die folgenden Eintraege stammen aus dem urspruenglichen stoqr-Repo (Pi-Betrieb) und dokumentieren den
gemeinsamen Code-Stand vor dem Android-Fork. Sie bleiben als Kontext erhalten.

### [Unreleased] — Angezeigter Name „Die Merbotts" + Gefahrenzone (dreistufiger Werksreset, G52/G53)

**(a) Geplant:** (1) Der oben rechts angezeigte Name soll von „Christopher" auf „Die Merbotts" (der Haushalt)
wechseln. (2) In den Einstellungen eine geschützte Funktion einbetten, die den Bestand löscht und das System auf
„Werkseinstellung" zurücksetzt — mit GitHub-artiger Type-to-Confirm-Bestätigung plus zweiter Abfrage, mehrstufig.

**(b) Umgesetzt:**
- **Name (DB-only, kein Code):** `users.display_name` des ältesten Nutzers auf „Die Merbotts" gesetzt. Kette:
  `display_name` → `rowToBypassUser` (`name: displayName ?? email ?? id`) → `data.user.name` → Navbar
  (`+layout.svelte` Desktop + mobiles Menü). Kein Code-Change; `auth-bypass.test.ts`-Fixture bleibt unberührt.
- **Gefahrenzone (G53):** Neue Server-Action `resetHousehold` in `einstellungen/+page.server.ts` — dreistufig:
  A = nur `inventory_items`; B = + `products`/`product_*`/`product_prices`/`product_stores`/`stock_targets`/
  `globus_snapshots`; C = kompletter Werksreset aller Inhaltsdaten (zusätzlich Einkaufslisten/-käufe, Orte/Lager/
  Märkte via `locations`-Cascade, eigene Einheiten, `category_mappings`, `expiry_config`, `audit_log`, `invites`
  sowie die geseedeten Referenzdaten `categories` + `nutrient_types`). Alle Löschungen laufen **children-first in
  EINER Transaktion** (die meisten Household-FKs sind RESTRICT). Feste Bestätigungsphrase je Stufe, serverseitig
  erneut geprüft. Neue Danger-Zone-Karte + Type-to-Confirm-Modal (`Modal.svelte`) in `einstellungen/+page.svelte`;
  Reset-Button bleibt disabled bis die Phrase exakt getippt ist (2-Stufen-Bestätigung: Modal öffnen + tippen).
- Test-Manifest: G52 (Name) + G53 (Werksreset, 5 Checks inkl. Regression) in `docs/test-manifest.html`.

**(c) Probleme / Hinweise (inkl. Testergebnis):**
- **Cache-Fallstrick (bestätigt):** Nach dem DB-Namenswechsel zeigte die Navbar trotz Browser-Refresh weiter
  „Christopher". Ursache: `getBypassUser()` cached den Nutzer **prozessweit**. Erst `docker compose up -d
  --force-recreate stoqr` (nicht `restart`, nicht Browser-Reload) ließ „Die Merbotts" durchschlagen. Verifiziert.
- **`products` ist global (keine `householdId`):** Bei Stufe B/C werden Artikel **hart global** gelöscht (bewusste
  Entscheidung fürs Single-Household-Setup; `gtin` ist global unique). `product_nutrients`/`product_field_sources`
  cascaden mit.
- **Stufe C mit Auto-Re-Seed:** Kategorien + Nährwert-Typen werden am Ende **derselben Transaktion** wieder auf
  Werkszustand eingespielt (Datenquelle: `categorySeeds`/`nutrientTypeSeeds` aus `packages/db/seeds/*`, jetzt über
  `@stoqr/db` re-exportiert — kein Duplikat). Folge: nach dem Werksreset ist **ohne manuelles `psql -f /seed.sql`**
  alles sofort wieder da (Auswahllisten gefüllt), man bleibt eingeloggt. „Von vorne beginnen ohne Nachpflege."
  Warntext/Toast der Stufe C entsprechend angepasst (kein Re-Seed-Hinweis mehr).
- **SvelteKit-Fallstrick:** Ein freier `export const RESET_PHRASES` in `+page.server.ts` bricht den Build
  („Invalid export") — Phrasen sind server-lokal (ohne `export`), der Client hält seine eigene Kopie.
- **Gate grün:** typecheck ✓, lint 0 Fehler / 35 Warnungen (33 Baseline + 2 erwartete `form as any`), 208 Tests ✓,
  build ✓.

---


**(a) Geplant:** Login vollständig deaktivierbar machen — die App soll direkt (ohne Login-Seite) laden, „Benutzer überall
abschalten ohne Funktion zu beeinträchtigen", und der Zustand per Schalter umkehrbar sein. Kein Ausbau der Auth-Infra
(Better Auth, `/api/auth`, Login-/Register-Seiten bleiben liegen), nur ein Bypass.

**(b) Umgesetzt:**
- Neues Modul `apps/web/src/lib/server/auth-bypass.ts`: `AUTH_DISABLED = process.env.AUTH_DISABLED === 'true'`,
  `getBypassUser()` (prozessweit gecacht, liest den ältesten `users`-Datensatz und formt ihn zu Better Auths `User`),
  `makeBypassSession()` (minimales, typkonformes Session-Objekt).
- `hooks.server.ts`: bei `AUTH_DISABLED` wird die Default-Identität in `locals.user`/`locals.session` injiziert, statt
  `auth.api.getSession` zu lesen. Damit passieren alle ~65 `if (!locals.user)`-Guards, die App-Shell rendert und
  `requireHouseholdId(userId)` löst normal auf — **keine** der Guards/Queries/Schemas wurde angefasst.
- `(auth)/login/+page.server.ts`: bei aktivem Flag Redirect auf `/` (tote Login-Seite nicht anzeigen).
- `+layout.server.ts` reicht `authDisabled` durch; `+layout.svelte` blendet beide „Abmelden"-Buttons aus, wenn
  deaktiviert. `logout()` bleibt unverändert (aktiv, sobald das Flag wieder weg ist).
- Doku: `.env.example` + `docs/docker-compose.fam.ily.yml` um `AUTH_DISABLED` ergänzt.

**(c) Probleme / Hinweise (inkl. Testergebnis):**
- **Bewusster Fallback:** Auf einer völlig leeren DB (noch nie ein Nutzer angelegt) gibt `getBypassUser()` `null` zurück
  → der Hook fällt auf den normalen Login-Pfad zurück und `/register` bleibt erreichbar, damit man sich nicht aussperrt.
- **FK-Zwang:** Die injizierte `locals.user.id` ist die eines **real existierenden** Nutzers (Inserts schreiben
  `createdBy`/`userId` mit FK auf `users.id`) — deshalb DB-getrieben statt hart kodiert, und **keine** Migration/kein Seed
  nötig; auf dem Pi existiert der Nutzer bereits.
- **Reaktivierung:** `AUTH_DISABLED` aus der `.env` entfernen → Login-Verhalten exakt wie zuvor. Schritt-für-Schritt
  (an-/abschalten, inkl. `--force-recreate`-Fallstrick) steht in `docs/chatgpt-handover-prompt.md` §8.5.
- **Pi-Verifikation (erledigt):** Nach `AUTH_DISABLED=true` + `--force-recreate` liefert `curl .../login` jetzt
  **302 → Location: /** (vorher 200) und die App lädt unter `/` direkt — das ist der **erwartete Erfolgsbeweis**, dass
  der Bypass greift, kein Fehler. Der Smoke-Test in §8.4 wurde entsprechend angepasst: bei aktivem Flag prüft man `/`
  auf 200 und erwartet auf `/login` bewusst 302→/.
- **Ursache „kein Unterschied" beim ersten Versuch:** Die Variable war nie im Container (`printenv AUTH_DISABLED` leer),
  weil die Pi-Compose nur `env_file` nutzt und `env_file` erst beim **Neu-Erzeugen** (`--force-recreate`), nicht beim
  bloßen `restart` neu gelesen wird — plus AUTH_DISABLED fehlte in der `.env`. Kein Code-Bug; Compose spiegelt die
  Variable jetzt zusätzlich explizit in den `environment:`-Block.

Gate: typecheck 0, lint 0/33, build ✓, vitest 204/204. Keine Migration, kein Seed.

---


Der Tester (Christopher) hat den kompletten Test-Manifest-Durchlauf **A–E, 203/203 Punkte, als getestet und
funktional bestätigt** — inklusive des gesamten Pfand-Strangs G47–G50. Damit gilt der Stand bei Commit `d7290aa`
(`ghcr.io/labushuya/stoqr:main`) als **auf dem Pi verifizierte Baseline**. Alle bis hierher als „implementiert, Test auf
Pi ausstehend" geführten G-Blöcke bis G50 sind hiermit bestätigt.

Ab dieser Baseline gilt das verbindliche **Per-Turn-Handover-Format** (dokumentiert in `docs/ROADMAP.md` und
`docs/chatgpt-handover-prompt.md §12`): jeder künftige Test-Manifest-Turn endet mit genau einem Commit, dessen
CHANGELOG-Eintrag drei Dinge festhält — **(a) was war geplant, (b) was wurde umgesetzt, (c) was hat nicht funktioniert /
wo gab es Probleme (inkl. Testergebnis)**. So kann jede fremde LLM-Instanz nahtlos übernehmen, ohne den Chat-Verlauf zu
kennen; das bisher nur im Browser-localStorage des Testers lebende Testergebnis wird dadurch dauerhaft im Repo verankert.

Keine Code-Änderung, keine Migration — reine Doku-/Status-Konsolidierung. Gate unverändert grün.

### Commits
Baseline (dieser Commit) — G47–G50 + Manifest A–E als „auf Pi getestet ✓ 2026-08-13" markiert; Per-Turn-Handover-Format
als Prozessregel verankert. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G50: Pfand-Betrag-fehlt sichtbar anmahnen (auf Pi getestet ✓ 2026-08-13)

Aus dem G49-Test: nach der Katalog-Sicherung ist Pfand gesetzt (`hasDeposit=true`), aber ohne Betrag (`depositCt=null`),
weil der Abruf nur ja/nein liefert (Betrag = Stufe 2). Erwartetes Verhalten — aber der Nutzer soll den fehlenden Betrag
sichtbar zum Nachpflegen angemahnt bekommen (Idee: wie „Kein MHD", andere Farbe).

- **DepositBadge:** bei `hasDeposit && depositCt==null` jetzt „Pfand — Betrag?" im **Amber/gestrichelt**-Warnstil
  (eigene Farbe, nicht MHD-orange, nicht Fehler-rot) + Tooltip „bitte am Artikel nachpflegen". Bei gesetztem Betrag
  unverändert das ruhige blaue „Pfand X €". Greift automatisch überall (Detailseite, Inventar-Karten, Artikelliste).

Gate: typecheck 0, lint 0/33, build ✓, vitest 204/204. Keine Migration.

### Commits
G50 (dieser Commit) — DepositBadge Amber-Warnvariante bei fehlendem Betrag. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G49: Pfand-Fixes — an count-Einheit gebunden + Card/Bearbeiten-Dialog korrigiert (auf Pi getestet ✓ 2026-08-13)

Aus dem G47/G48-Test, zwei Bugs + fachliche Klarstellung (Root-Causes per Workflow belegt):

- **Fachlich:** Pfand gibt es real NUR auf **count-Gebinde** (Flasche/Dose/Stück), nicht auf kg/l/g/ml. Damit entfällt
  der ganze „Pfand ohne Gebinde nicht berechenbar" (`depositUnknown`/„Pfand ?")-Sonderfall komplett.
  - `ProductForm`: Pfand-Checkbox nur aktiv bei count-Einheit; sonst **gesperrt + Hinweis** „Pfand nur für Stück-Einheiten".
  - **Server-Guard** (POST/PATCH `/api/products`): Pfand hart auf false/null, wenn die effektive Einheit nicht count ist
    (robuste Invariante gegen Nicht-Form-Pfade/Altdaten; behebt auch den else-if-Pfad, der `depositCt` ohne `hasDeposit` schrieb).
  - `estimateLineCost`: Pfand nur im count-Zweig; mass/volume → kein Pfand. `depositUnknown` + `itemsDepositUnknown` entfernt.
  - Alle Badges nur bei `hasDeposit && count` — Altdaten (kg+Pfand) werden ignoriert (kein Badge, keine Rechnung).
- **Bug 1a (Card verschwand):** die Pfand-Fakt-Zeile auf der Detailseite hing fälschlich IM count-Gebinde-`{#if}`-Block
  → bei kg (mass) nicht gerendert. Jetzt eigenständige Zeile (`isCountUnit`-gated).
- **Bug 2 (Bearbeiten-Dialog spiegelt nicht):** der ProductForm-Aufruf baute ein reduziertes product-Literal OHNE
  `hasDeposit`/`depositCt` → Checkbox blieb leer trotz gesetztem Pfand. Ergänzt (Marke/Beschreibung waren bereits drin)
  → alle übernommenen Werte im Bearbeiten-Modus vorbefüllt.
- Neuer reiner Helfer `isCountUnit(symbol, metaMap)` (stock.ts).

Gate: typecheck 0, lint 0/33, build ✓, vitest 204/204. **Keine Migration** (nur Logik/Guards/Anzeige; Felder aus 0021).

### Commits
G49 (dieser Commit) — Pfand an count gebunden (ProductForm-Gate + Server-Guard + estimateLineCost); depositUnknown-UI
entfernt; Card aus count-Block gelöst; ProductForm-Literal +hasDeposit/depositCt; Badges count-gated; isCountUnit + Tests.
Exakter Hash: siehe `git log`.

---

## [Unreleased] — G48: Pfand sichtbar machen — einheitliches DepositBadge überall (auf Pi getestet ✓ 2026-08-13)

G47-Nachbesserung. Pfand war in der DB + berechnet, aber **nirgends erkennbar** (Detailseite gar nicht, Einkaufsliste
nur als schwacher grauer Inline-Text, Einkauf pro Position gar nicht) — Nutzer zu Recht: „Textwüste". Ursache: G47 wich
vom etablierten Badge-Design ab. Fix: EINE Komponente, überall gleich, im vorhandenen Pill-Muster.

- **Neu `DepositBadge.svelte`** (Vorbild `SourceBadge`): eigene **neutrale Farbe (Blau)** — bewusst nicht orange
  (Angebot/reserviert) oder grün (günstigster). Fälle: „Pfand 0,25 €" / „Pfand" (Betrag offen) / „Pfand ?" (nicht
  berechenbar). Kein Badge ohne Pfand.
- **Sichtbar an 5 Orten:** Artikel-Detailseite (Fakt-Zeile, read-only), Inventar-Karten (Einzel- + Artikel-Ansicht),
  Einstellungen→Artikel-Liste, Einkaufsliste (Badge statt Grautext), Einkauf-Detail (pro Position, fehlte ganz).
- **Loader-Lücken geschlossen** (die G47-Ursache): `getInventoryItems` + `listProducts` liefern jetzt
  `hasDeposit`/`depositCt`.
- **Summe getrennt & klar** (Einkaufsliste + Einkauf): drei Zeilen „Ware / Pfand / Summe" statt Rechenstring; alte
  graue `.deposit-line` entfernt.

Gate: typecheck 0, lint 0/33, build ✓, vitest 204/204. **Keine Migration** (Felder aus 0021).

### Commits
G48 (dieser Commit) — DepositBadge.svelte; getInventoryItems/listProducts +hasDeposit/depositCt + lokale Typen; Badge
auf Detailseite/Inventar-Karten/Artikelliste/Einkaufsliste/Einkauf; getrennte Summenzeilen. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G47: Pfand / Leergut (auf Pi getestet ✓ 2026-08-13)

ROADMAP #5. Pfand als **Artikel**-Eigenschaft, mit Fallback für manuelle Pflege und getrenntem Ausweis.

- **Migration 0021** (additiv): `products.has_deposit` + `products.deposit_ct`, `product_prices.price_includes_deposit`.
- **Artikel-Formular:** Checkbox „Pfand" + Schnellwahl **0,08 / 0,15 / 0,16 / 0,25 €** + Freieingabe. Herkunfts-Schutz
  (`ProductField` += `'deposit'`): ein Abruf-Vorschlag überschreibt kein manuell gesetztes Pfand.
- **Preis-Flag „Preis enthält Pfand"** (`price_includes_deposit`) an der Preis-Erfassung — dein Fallback: Preis 0,69 €
  ohne Pfand-Angabe → Pfand 0,25 € manuell + „enthält kein Pfand" → Estimate addiert es.
- **Estimate:** Ware + Pfand **getrennt** (Einkaufsliste + Einkauf). Pfand fällt je Stück an (count = qty; mass/volume
  nur über packSize). Ohne ableitbare Stückzahl → nicht berechnen + Hinweis „Pfand nicht berechenbar (Gebinde fehlt)".
  `priceIncludesDeposit=true` → kein Doppelzählen. Reiner Helfer `prices.ts` erweitert (+ Tests).
- **Katalog-Sicherung:** `parseGlobusDetailJsonLd` leitet **Pfand ja/nein** aus der `description` ab
  (`/\b(EW|MW|DUE)\b|Einweg|Mehrweg|Pfand/i`; nur EW/DUE/Einweg real belegt); als ankreuzbare Spiegel-Zeile
  „Pfandpflicht" übernehmbar (Betrag bleibt manuell — exakter Betrag = Stufe 2/Headless).

Gate: typecheck 0, lint 0/33, build ✓, vitest 204/204 (+7). Migration 0021.

### Commits
G47 (dieser Commit) — Schema/Migration 0021; ProductForm + Whitelist-Kette (create/update/POST/PATCH) + ProductField
'deposit'; prices.ts price_includes_deposit + Estimate mit depositCents/depositUnknown + Tests; getrennter Ausweis
Einkaufsliste/Einkauf; Pfand-ja/nein aus JSON-LD + mirror-diff/listCatalogMirror/applySnapshotToProduct + Spiegel-Zeile.
Exakter Hash: siehe `git log`.

---

## [Unreleased] — G46: Günstigster-Markt-Ranking (Detailseite + Einkaufsliste) (implementiert, Test auf Pi ausstehend)

ROADMAP #4b. Macht die Preis-/Grundpreis-Daten (G44) sichtbar nutzbar: je Artikel wird der **günstigste Markt pro
Basiseinheit** markiert — fair, mit dem PAngV-Grundpreis bevorzugt.

- **Neu `lib/utils/price-compare.ts`** (rein, 12 Tests): `baseUnitFactor` (normiert l/kg/100g/ml/… auf g/ml),
  `pricePerBaseUnit` (**Grundpreis bevorzugt**, sonst Eigenrechnung `priceCt/toBaseFactor` via `resolveUnitMeta`+`buildPackSize`),
  `rankCheapestStore` (billigster über die größte vergleichbare Gruppe; **Angebote zählen mit**; nur gleiche Dimension /
  bei count gleiches Symbol; ≤1 vergleichbarer Markt → kein Marker).
- **Detailseite** (`inventar/[id]`): Badge **„günstigster"** am billigsten Markt der Preise-Card + Hinweis
  **„nicht vergleichbar"** an Märkten mit inkompatibler Einheit. Rein clientseitig (kein Server-Change).
- **Einkaufsliste**: je Zeile Hinweis **„günstigster: {Markt}"** über alle Märkte mit aktuellem Preis.
  `getCurrentPricesForListProducts` um `basePriceCt`/`basePriceUnit` erweitert.

Gate: typecheck 0, lint 0/33, build ✓, vitest 198/198 (+12). **Keine Migration** (nur select-columns + reine Logik + Anzeige).

### Commits
G46 (dieser Commit) — price-compare.ts + Tests; inventar/[id] Ranking-Badge/Hinweis; prices.ts +basePrice für Listen;
einkaufsliste günstigster-Markt-Hinweis. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G45: Marke/Beschreibung aus dem Katalog übernehmbar (implementiert, Test auf Pi ausstehend)

Aus dem G44-Test (184/185): Grundpreis-Anzeige ✓ (wird gezeigt wo ausgezeichnet). Offen war G44-3 — die Werte unter
„Abgerufene Felder" (Marke/Beschreibung aus dem Detailseiten-JSON-LD) waren nur Anzeige, **nicht übernehmbar**. Der
Katalog-Spiegel übernahm bisher nur Name/Bild/Kategorie/Preis.

- **Marke + Beschreibung als ankreuzbare Diff-Zeilen** im Katalog-Spiegel (analog Name/Bild/Kategorie). Beim „Übernehmen"
  werden sie in `products.brand`/`products.description` geschrieben (Felder existierten schon → **keine Migration**).
- **Herkunfts-Schutz:** Schreibregel „angekreuzt ODER Feld leer"; `setFieldSources({brand,description:'globus'})`.
  `ProductField`-Enum um `'description'` erweitert → der `manual`-Schutz (G31/G34) greift jetzt auch für die
  Beschreibung: ein späterer Abruf überschreibt eine manuell gepflegte Beschreibung nicht.
- Werte kommen aus `snapshot.extracted` (Feld-Landkarte, G44) — es gibt keine flachen brand/description-Spalten am
  Snapshot. `listCatalogMirror` leitet `snapshot.brand/description` + `diff.brand/description` daraus ab;
  `computeMirrorDiff` + `defaultSnapFields` um beide Felder erweitert (reine Helfer, getestet).

Gate: typecheck 0, lint 0/33, build ✓, vitest 186/186 (+1). Keine Migration.

### Commits
G45 (dieser Commit) — applySnapshotToProduct + review-Endpoint brand/description; mirror-diff/mirror-category +
listCatalogMirror-Ableitung aus extracted; einstellungen 2 Diff-Zeilen + snapFields/payload; ProductField 'description'.
Exakter Hash: siehe `git log`.

---

## [Unreleased] — G44: Reichere Globus-Daten (Stufe 1) — Grundpreis + JSON-LD + Rohdaten-Archiv (implementiert, Test auf Pi ausstehend)

Ziel: maximaler Datenreichtum aus dem Globus-Abruf. Analyse an **echten Globus-Antworten** ergab: das heute geparste
Suggest-JSON ist karg (id/name/category/price/currency, über alle Sortimente identisch), der Reichtum liegt im
umgebenden HTML + auf der Detailseite. Stufe 1 (risikolos, kein Headless) hebt das:

- **Grundpreis (PAngV):** aus dem Suggest-HTML (`reference-price`, z.B. „0,19 €/l") — der gesetzlich ausgezeichnete
  Preis je Basiseinheit statt theoretischer Umrechnung. Neu am `product_prices` (`base_price_ct`/`base_price_unit`),
  fließt aus dem Online-Abruf in den Vorschlag und wird an der Preis-Card angezeigt.
- **Detailseiten-JSON-LD:** neuer Abruf der Produkt-Detailseite (best-effort), parst `schema.org/Product`
  (brand „Jeden Tag", description „1,5L PET EW DUE", offers.{availability,priceValidUntil,seller}).
- **Rohdaten-Archiv + Feld-Landkarte:** `globus_snapshots.raw_detail_html` archiviert das volle Detail-HTML;
  `globus_snapshots.extracted` (jsonb) speichert je Feld **Wert + Quelle + Zugehörigkeit** (`buildFieldMap`) — im
  Katalog-Spiegel als aufklappbare Tabelle „Abgerufene Felder" einsehbar.
- **Reine, getestete Parser:** `parseGlobusReferencePrice`, `parseGlobusDetailJsonLd`, `normalizeBaseUnit`,
  `extractDetailUrlsByEan`, `buildFieldMap` (+ GlobusSuggestProduct um basePrice/detailUrl erweitert). 12 neue Tests
  an echten HTML-Schnipseln.

Migration **0020** (additiv, nullable, kein Backfill) — wird nur in CI gegen echtes Postgres getestet. Reichere
Daten werden nur VORgeschlagen, Artikel nie automatisch überschrieben (Herkunfts-/Vorrang-Logik G20/G34 bleibt).

**Stufe 2 (separat, offen):** Headless-Chromium (Playwright) für JS-gerenderte Felder (exakter Pfandbetrag,
Nährwerte). Erfordert Dockerfile-Umbau (Alpine→Debian/`apk chromium`), arm64/non-root — eigenes Projekt.

Gates: typecheck 0, lint 0/33, build ✓, vitest 183/183 (+12). Migration 0020.

### Commits
G44 (dieser Commit) — globus-price.ts (Parser + buildFieldMap + Tests), globus.ts (fetchGlobusDetail + Snapshot-Detail),
Schema/Migration 0020 (base_price + raw_detail_html/extracted), Persistenz (recordSnapshot/recordProposedPrice),
Anzeige (Preis-Card Grundpreis + Katalog-Spiegel Feld-Landkarte). Exakter Hash: siehe `git log`.
G44-fix — Grundpreis kam auf dem Pi nicht an: `parseGlobusSuggestJson` suchte den reference-price in einem fixen
2000-Zeichen-Fenster, im echten Globus-HTML liegt er aber ~2919 Zeichen hinter dem etracker-Attribut (Bild-srcset
dazwischen). Fix: Segment-Grenze bis zum nächsten Treffer statt fixem Fenster (+2 Tests mit grossem Abstand).
Zusätzlich: `recordSnapshot`-„unchanged"-Pfad trägt rawDetailHtml/extracted jetzt nach (bereits gesicherte Artikel
bekamen sonst nie eine Feld-Landkarte).

---

## [Unreleased] — G43: zwei Nachbesserungen aus dem G42-Test (implementiert, Test auf Pi ausstehend)

Konsistenz-Notizen aus dem G42-Test (179/179), beide UX:

- **G42-1:** Die Korrektur-Vorschau **nach unten** zeigte nur die FIFO-reduzierten Zeilen. Jetzt werden — konsistent
  zur „nach oben"-Ansicht — **alle** relevanten Bestandszeilen editierbar gezeigt; der FIFO-Vorschlag ist vorbelegt
  (aus `updates` eingemischt, unberührte Zeilen behalten ihre Menge). `loadInventoryPreview` mappt `relevantRows` +
  Vorschlag; Commit/0→verbraucht unverändert.
- **G42-2:** Die Mengen-Abfrage beim **Wiederherstellen** (Bestand mit Menge 0) lief über `window.prompt`
  (UI-Bruch). Ersetzt durch ein **stoqr-Modal** mit Zahlenfeld — auf beiden Seiten (`/inventar`-Kontextmenü und
  Detailseite). `restoreItem`/`restoreRow` in „öffnet Modal bei Menge 0" + `doRestore…(qty)` aufgeteilt; bei Menge > 0
  weiterhin direkt ohne Modal.

Gates: typecheck 0, lint 0/33, build ✓, vitest 170/170 (unverändert, reine UI). Keine Migration.

### Commits
G43 (dieser Commit) — inventar/[id] decrease-Vorschau auf relevantRows + FIFO-Merge + Restore-Modal;
inventar/+page.svelte Modal-Import + Restore-Mengen-Modal statt prompt. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G42: Bestandskorrektur mit editierbarer Vorschau (implementiert, Test auf Pi ausstehend)

Aus einer G41-Nutzer-Rückfrage: die Bestandskorrektur („Bestand korrigieren") war intransparent und hatte mehrere
Lücken (verifiziert per Workflow, 3 Explore-Leser). Umbau in eine bestätigte, editierbare Zwei-Schritt-Korrektur:

- **Editierbare Vorschau statt blindem FIFO:** Schritt 1 = Zielmenge; Schritt 2 = Vorschau der betroffenen Zeilen
  (alt→neu, MHD-Kontext), **jede Zeile anpassbar**, mit Live-Gesamtsumme. Server liefert die Verteilung als **Dry-Run**
  (`{preview:true}`, schreibt nichts) — `planInventoryAdjustment` (bereits rein) um `oldQuantity`/`unit`/`bestBeforeDate`
  je Zeile, `relevantRows` und `suggestedNewQuantity` erweitert. Commit schreibt die **bestätigten** Zeilen.
- **Korrektur nach oben (neu):** früher stiller „geht nicht"-Abbruch. Jetzt fragt die UI beim Aufstocken:
  **bestehende Zeilen erhöhen** ODER **neue Zeile anlegen** (MHD direkt im Dialog ausfüllbar). Nach unten: keine Frage,
  reine FIFO-Reduktion.
- **0 → verbraucht:** Zeilen, die durch die Korrektur auf 0 fallen, bekommen Status `consumed` (kein „available/0" mehr).
- **Refresh-Bug behoben:** `saveInventory` reseedet nach `invalidateAll()` jetzt `siblings` aus `data.siblings`
  (Muster `runNormalize`) — korrigierte Zeilen sind **sofort** sichtbar, kein manueller Refresh
  ([[stoqr-svelte5-stale-derived-reseed]]).
- **Undo-Grundlage:** die Korrektur protokolliert jetzt **je berührter Zeile** ein Audit mit `oldValues`/`newValues`
  (Item-ID + Alt-Menge/-Status) statt eines Summen-Eintrags ohne Alt-Werte. (Undo-Button folgt später.)

Gates: typecheck 0, lint 0/33, build ✓, vitest 170/170 (+2 stock). **Keine Migration** (nur zusätzliche Audit-Zeilen).

### Commits
G42 (dieser Commit) — planInventoryAdjustment-Anreicherung + Tests; inventory-adjust Dry-Run/Commit + 0→consumed +
Audit je Zeile; inventar/[id] zweistufiges Korrektur-Modal mit editierbarer Vorschau + Aufstock-Wahl + Reseed.
Exakter Hash: siehe `git log`.

---

## [Unreleased] — G41: Verbraucht-Handling + Wiederherstellen & EAN in Artikel-Ansicht (implementiert, Test auf Pi ausstehend)

Aus der ROADMAP-Auswahl. Evaluierung (2 Explore-Durchläufe) korrigierte die veralteten ROADMAP-Notizen:
„Einkäufe umbenennen" war bereits fertig; der „Nur verfügbare"-Toggle ist NICHT kaputt (seit G8-5). Die echten
Lücken beim Verbraucht-Handling waren andere:

- **`consumedAt` wurde im Betrieb nie gesetzt:** Der Haupt-Client-Pfad (PATCH `{status:'consumed'}`) pflegte
  `consumedAt` nicht (nur eine ungenutzte Action tat es). **Fix in `updateInventoryItem`** (`products.ts`):
  Statuswechsel weg von `available` stempelt `consumedAt` automatisch, Wechsel zurück auf `available` nullt ihn —
  eine Wahrheitsquelle, alle Pfade (Liste + Detailseite) profitieren.
- **Wiederherstellen (neu):** Kontextmenü (`/inventar`) und Zeilen-Aktion (Detailseite) zeigen für nicht-verfügbare
  Bestände jetzt **„Wiederherstellen"** → Status zurück auf `available`. Ist die Menge 0 (beim Verbrauchen geleert),
  wird vorher eine neue Menge abgefragt. Kein neuer Endpunkt — nutzt PATCH `{status:'available'[, quantity]}`.
- **„Verbraucht vor X Tagen" (neu):** Bei nicht-verfügbaren Beständen erscheint neben dem Status-Badge ein dezenter
  Zusatz (heute/gestern/vor N Tagen). Reiner, getesteter Helfer **`lib/utils/relative-time.ts`** (`formatRelativeDays`,
  de-DE, Kalendertage über `date-fns`). Altbestände ohne `consumedAt` zeigen nur das Badge — kein Fehler.
- **#3 EAN in der Artikel-Ansicht:** Die G39-Artikel-Accordion zeigt jetzt die EAN (wie die Einzelbestands-Ansicht).

Gates: typecheck 0, lint 0/33, build ✓, vitest 169/169 (+6 relative-time). **Keine Migration** (Spalte `consumed_at`
existierte bereits).

### Commits
G41 (dieser Commit) — updateInventoryItem consumedAt-Pflege; relative-time.ts + Tests; /inventar + /inventar/[id]
Wiederherstellen + „vor X Tagen"; EAN in Artikel-Karte. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G40.1: Deeplink-Scroll auf der Bestands-Detailseite repariert (implementiert, Test auf Pi ausstehend)

Aus dem G40-Test: G40-1/-2 (MHD-Speichern) ✓, aber **G40-3/-4 funktionierten gar nicht** — der Scroll zum
angeklickten Bestand griff nicht, das Highlight pulste nicht.

- **Root-Cause (verifiziert, 2 Explore-Durchläufe):** Die Bestandsliste rendert synchron aus `data.siblings` (kein
  `{#await}`/Effekt), das Ziel-Element existiert also beim `onMount`. Aber `scrollIntoView` lief **synchron in
  `onMount`** — bevor das Layout darüber (Produktbild + Karten ohne finale Höhe) gesetzt war → die berechnete
  Scroll-Position war veraltet, der Browser verwarf den Smooth-Scroll. (Der funktionierende Dashboard-Scroll läuft
  per `onclick`, daher biss ihn das Timing nie.) Zusätzlich fehlte ein Offset für die 56px-Sticky-Navbar.
- **Fix:** Scroll über **doppeltes `requestAnimationFrame`** verzögern (Layout hat gesetzt), `scroll-margin-top: 72px`
  an `.stock-entry` (Zeile bleibt unter der Sticky-Navbar frei). Highlight jetzt **durchgehend pulsierend** und nach
  **5 s** per JS entfernt (statt 3 kurzer Pulse). `prefers-reduced-motion` respektiert. Cleanup: `cancelAnimationFrame`
  + `clearTimeout` im onMount-Teardown.

Gates: typecheck 0, lint 0/33, build ✓, vitest 163/163 (unverändert). Keine Migration.

### Commits
G40.1 (dieser Commit) — inventar/[id]/+page.svelte: rAF-verzögerter Scroll, scroll-margin-top, 5-s-Puls-Highlight.
Exakter Hash: siehe `git log`.

---

## [Unreleased] — G40: zwei Verfeinerungen aus dem G39-Test (implementiert, Test auf Pi ausstehend)

Aus dem G39-Test (165/165) blieben zwei Notizen — beide klein, kein Blocker:

- **G39-6 (Bug behoben):** Beim Speichern der MHD-Ampel-Schwellen (Einstellungen) leerten sich die Eingabefelder
  sofort; erst nach Reload waren die Werte wieder da. Ursache: das `?/updateGlobalTolerance`-Formular ruft im
  `use:enhance` `await update()` — SvelteKit macht `invalidateAll()` **und** `form.reset()`, was die number-Inputs
  leert, während der lokale `$state` nicht aus dem frischen `data.expiryConfig` reseedet wurde. Serverseitig war alles
  korrekt (upsert). Fix: `update({ reset: false })` + Reseed der `$state` aus `data.expiryConfig` nach dem Update
  (die [[stoqr-svelte5-stale-derived-reseed]]-Falle).
- **G39-3 (Verfeinerung):** Klick auf eine Bestandszeile in der Artikel-Ansicht führt zur Detailseite und **scrollt
  dort jetzt zum angeklickten Bestand** (`scrollIntoView`, zentriert) + kurzes **pulsierendes Highlight**
  (`stock-entry--flash`, 3 Pulse, `prefers-reduced-motion` respektiert). Kein Link-Umbau nötig — die Detailseite
  markiert den Ziel-Bestand ohnehin schon (`stock-entry--current`); ergänzt wurden nur `id="stock-<id>"` + `onMount`.
  Guard: nur bei >1 Bestand.

Gates: typecheck 0, lint 0/33, build ✓, vitest 163/163 (unverändert, reine UI). Keine Migration.

### Commits
G40 (dieser Commit) — einstellungen/+page.svelte (Reseed + reset:false), inventar/[id]/+page.svelte (onMount-Scroll +
Flash-Highlight). Exakter Hash: siehe `git log`.

---

## [Unreleased] — G39: Inventar-Ansicht „nach Artikel" (Bestände je Artikel aggregiert) (implementiert, Test auf Pi ausstehend)

Die `/inventar`-Übersicht zeigte bisher **einzelne Bestände** (`inventory_items`) flach — ein Artikel mit mehreren
Beständen erschien mehrfach. Neu (ROADMAP): eine **Artikel-Ansicht**, die Bestände je Artikel aggregiert (auf-/
zuklappbar), plus ein Umschalter zur bisherigen Einzelbestands-Liste.

- **Umschalter** Artikel ↔ Einzelbestände; **Default = Artikel-Ansicht**, Wahl in `localStorage`
  (`stoqr:inventar:viewMode`) gemerkt (SSR-sicher: Default vor `onMount`, echter Wert erst clientseitig).
- **Artikel-Karte** (Accordion, Muster aus `/orte`): Icon + Name + aggregierte **Gesamtmenge**
  (`formatStockTotal`, Gebinde dual „3 Flasche (4,5 l)"), **Anzahl verfügbarer Bestände** (Badge) + frühestes
  **MHD** (Ampel). Aufklappen → die einzelnen Bestände als Zeilen (Link auf `/inventar/{bestand-id}`).
- **Gesamtmenge = nur verfügbare** Bestände (konsistent zur Detailseite; `aggregateStock` filtert `available`).
  `availableCount` + `earliestBestBefore` nutzen dieselbe Teilmenge.
- **Bestehende Filter** (Suche, Ort, „nur verfügbare") greifen auch hier: Artikel erscheint nur, wenn ein Bestand
  durchkommt; 0-verfügbar fällt bei „nur verfügbare" automatisch weg. Header-Zähler zeigt „N Artikel" bzw. „N Bestände".
- **Neu `lib/utils/inventory-group.ts`** (rein, DB-frei) `groupInventoryByProduct(items, unitMetaMap)` — bucketiert
  nach `product.id`, aggregiert je Bucket über `aggregateStock`/`buildPackSize`, sortiert nach frühestem MHD → Name.
  **10 Unit-Tests**.
- **MHD-Ampel vereinheitlicht:** nutzt jetzt die Haushalts-Einstellungen (`data.expirySettings`) statt der Hardcodes
  (7/2) — in Bestands- UND Artikel-Ansicht.
- **Loader/Query:** `inventar/+page.server.ts` lädt zusätzlich `expirySettings`; `getInventoryItems` liefert am
  Produkt zusätzlich `defaultVolumeMl`/`defaultWeightG` (für `buildPackSize`). **Keine Migration.**

Gates: typecheck 0, lint 0/33, build ✓, vitest 163/163 (+10). Manifest: G39-Block.

### Commits
G39 (dieser Commit) — inventory-group.ts + Tests, Loader/Query-Ergänzung, /inventar Umschalter + Artikel-Accordion +
MHD auf expirySettings. Exakter Hash: siehe `git log`.
G39-fix — SSR-Crash behoben (`[500] displayCount(...) is not a function`): `displayCount` war als Wert-`$derived`
statt als aufrufbares `$derived(() => …)` geschrieben, im Markup aber als `displayCount()` aufgerufen. Der lokale
Gate (typecheck/build) rendert kein SSR → erst auf dem Pi sichtbar. Callable-vs-Wert-Falle
([[stoqr-svelte5-stale-derived-reseed]]-Umfeld).

---

## [Unreleased] — G38: Katalog-Spiegel-Entscheidungslogik in getestete reine Helfer extrahiert (Härtung, kein Verhaltenswechsel) (implementiert, Test auf Pi ausstehend)

Die über G20/G22/G34/G36/G37 gewachsene Kategorie-Vorrang-/Anzeige-Logik des Katalog-Spiegels war nur inline im
`einstellungen/+page.svelte` und nicht testbar — jeder Eckfall kostete einen Deploy-Zyklus. Refactor **ohne
Verhaltensänderung**:

- **Neu `lib/utils/mirror-category.ts`** (DB-/Svelte-frei) mit 5 reinen Funktionen: `resolveMirrorCategory`
  (Kategorie-Vorrang: Session → manuell → Regel-bei-Abweichung → gespeichert → auto), `mirrorCategoryTag`
  (Status-Tag-Kaskade → Label + Variante), `canTakeMirrorPrice`, `defaultSnapFields`, `mirrorSubmitCategoryId`.
- **`einstellungen/+page.svelte`** ruft die Helfer nur noch auf: `snapCategoryFor` ist ein dünner Wrapper
  (`sessionChoice = snapCategoryChoice[id]`), die Status-Tag-`{#if}`-Kaskade ist durch `{@const catTag = mirrorCategoryTag(...)}`
  + eine Tag-Span mit `class:`-Direktiven ersetzt (eine Wahrheitsquelle).
- **16 Unit-Tests** (`mirror-category.test.ts`) pinnen genau die Eckfälle fest, die die Regressionen verursacht haben
  (manuell schlägt Regel-Vorschlag, Regel-Vorschlag nur nicht-manuell, priceCt=0 gültig, Tag-Zweige, Submit-Wahl).

Gates: typecheck 0, lint 0/33, build ✓, vitest 153/153 (+16). Keine Migration. Manifest: G38-Block (interne Härtung).

### Commits
G38 (dieser Commit) — mirror-category.ts + Tests, Callsites/Tag-Markup auf Helfer umgestellt. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G37: Regression behoben — manuelle Kategorie schlägt Regel-Vorschlag in der Spiegel-Anzeige (implementiert, Test auf Pi ausstehend)

Aus dem G36-Test: nach dem G36-Fix ließ sich die Kategorie im Spiegel **nicht mehr manuell setzen** — jeder
„Übernehmen"-Klick sprang sofort auf die Regel-Kategorie zurück. Diagnose (Workflow):

- **Root-Cause (meine G34/G36-Interaktion):** Nach dem Übernehmen einer manuellen, von der Regel **abweichenden**
  Kategorie bleibt `differs` true (Regel ≠ gerade gesetzte Kategorie). `snapCategoryFor` stellte bei `differs` den
  **Regel-Vorschlag über** die gespeicherte Kategorie (G34), und der G36-Overlay-Verwurf entfernte zusätzlich die
  Session-Wahl → die Anzeige fiel auf den Regel-Vorschlag zurück.
- **Fix:** `snapCategoryFor` kennt jetzt die **Herkunft** (`categorySource`, seit G34 in der Zeile). Neue Reihenfolge:
  Session-Wahl → **wenn gespeichert `manual`: gespeicherte Kategorie (Regel-Vorschlag NICHT)** → Regel-Vorschlag bei
  `differs` (nur nicht-manuell) → gespeichert → autoMatch. So gewinnt eine manuell gesetzte Kategorie (Vorrang
  manuell > Regel), abweichende Regeln erscheinen weiter bei nicht-manuellen Kategorien (G34), Anzeige bleibt
  refresh-frei (G36). Der Status-Tag zeigt bei `categorySource === 'manual'` ebenfalls „manuell".

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G36-1-Verweis, G37-Block.

### Commits
G37 (dieser Commit) — snapCategoryFor respektiert categorySource (manuell schlägt Regel-Vorschlag). Exakter Hash: siehe `git log`.

---

## [Unreleased] — G36: Katalog-Spiegel aktualisiert nach „Übernehmen" sofort (stale Overlays verworfen) (implementiert, Test auf Pi ausstehend)

Aus dem G35-Test: nach „Übernehmen" wurde die Kategorie erst nach manuellem Refresh sichtbar. Diagnose (Workflow):

- **Root-Cause:** Server + `invalidateAll` sind korrekt, `catalogMirror` ist `$derived(data)`. Aber die lokalen
  **Overlays** `snapCategoryChoice`/`snapFieldOverrides` (User-Wahl/Checkbox-Zustände) wurden nach dem Übernehmen
  **nie verworfen** und haben im Anzeige-Getter (`snapCategoryFor`) **Vorrang** → sie verdeckten die frisch geladenen
  Daten, bis ein Browser-Refresh die Overlays leert. (Companion zur bekannten Reseed-Falle — hier über einem `$derived`.)
- **Fix:** In `reviewSnapshot` nach erfolgreichem `confirm` die Overlay-Einträge des betroffenen Snapshots **vor**
  `invalidateAll()` verwerfen (`snapCategoryChoice` ohne id, `snapFieldOverrides[id]` löschen, `catalogMirrorTick++`).
  Danach fällt der Getter auf die frischen `data`-Werte zurück → die übernommene Kategorie erscheint sofort.

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G35-2-Verweis, G36-Block.

### Commits
G36 (dieser Commit) — Overlays nach Übernehmen verworfen (sofortige Aktualisierung im Katalog-Spiegel). Exakter Hash: siehe `git log`.

---

## [Unreleased] — G35: Herkunft-Reset — klareres Feedback + Caller-State (kein Server-Bug) (implementiert, Test auf Pi ausstehend)

Aus dem G32/G33-Test: „Herkunft zurücksetzen" schien im Artikel-Katalog nicht zu wirken, und ein erneutes
„Katalog sichern" war nötig. Diagnose (Workflow): **kein Server-Bug** — der DELETE wirkt view-unabhängig
vollständig (löscht die `product_field_sources`-Zeile). Es war eine **Erwartungslücke**:

- Reset macht die Kategorie nur wieder **regel-empfänglich** — die eigentliche Neuzuordnung passiert erst beim
  **Übernehmen im Katalog-Spiegel** (G31-Pfad). Der Artikel-Katalog zeigt keine Herkunft und hat keinen
  Übernehmen-Flow, also *kann* sich dort nichts sichtbar ändern (auch nach Reload) — obwohl der Reset erfolgt ist.
- **Fix (rein UX, kein Datenpfad):** (1) Der Toast ist jetzt eindeutig: „Herkunft zurückgesetzt. Die Kategorie wird
  beim nächsten Katalog-Abgleich (Artikel-Sicherung → Übernehmen) neu per Regel zugeordnet." (2) `ProductForm` ruft
  nach dem Reset einen neuen `onReset`-Callback; der Artikel-Katalog nutzt ihn, um sein lokales `fieldSources`
  konsistent zu halten (Button bleibt aus, keine stale Herkunft im offenen Modal).
- **Erwartetes Verhalten (G32-2):** dass nach dem Reset ein „Katalog sichern" + „Übernehmen" folgt, ist inhärent —
  Sichern ≠ Zuordnen (wie in G31/G33 geklärt).

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G32-2/G33-1-Notiz + G35-Klarstellung.

### Commits
G35 (dieser Commit) — Reset-Toast präzisiert, onReset-Callback für Caller-State. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G34: Katalog-Spiegel zeigt frischen Regel-Vorschlag + „Herkunft zurücksetzen" auch im Spiegel (implementiert, Test auf Pi ausstehend)

Aus dem G32/G33-Test (Klarstellung des Nutzers: „ich schaue in Artikel-Sicherung"): der Reset-Button und der
Regel-Vorschlag wurden im **Katalog-Spiegel** erwartet — dort, wo der Nutzer arbeitet. Diagnose (Workflow):

- **G34-1 (stale Vorschlag):** Der Spiegel-Select zeigte die alte **gespeicherte** Kategorie statt des frischen
  Regel-Vorschlags — `snapCategoryFor` hatte die Reihenfolge `manuell → stored → autoMatch`, also verdeckte die
  gespeicherte Kategorie den neuen Vorschlag (test blieb, obwohl die Regel schon Obst sagte; erst „Übernehmen"
  machte es sichtbar). Fix: Reihenfolge jetzt **manuell → Regel-Vorschlag bei Abweichung (`differs`) → gespeichert
  → autoMatch**. Der Select zeigt den frischen Vorschlag sofort; ein neuer Tag **„Regel-Vorschlag"** kennzeichnet ihn.
  Beim Übernehmen schreibt der Server den Vorschlag mit Herkunft `globus` (manuelle Wahl weiterhin `manual`).
- **G34-2 (Reset-Button im Spiegel):** Der G32-Button steckte nur in `ProductForm` (Detailseite/Artikel-Katalog),
  nicht im Spiegel. Jetzt trägt die Spiegel-Zeile die **Kategorie-Herkunft** (neu `CatalogMirrorRow.product.categorySource`,
  in `listCatalogMirror` per **Batch-Query** geladen — kein N+1); bei Herkunft `manual` erscheint ein
  **„Herkunft zurücksetzen"**-Button (DELETE `…/sources?field=category` + `invalidateAll`). Danach greifen Regeln wieder.

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G32/G33-Verweis, neuer G34-Block.

### Commits
G34 (dieser Commit) — Spiegel zeigt Regel-Vorschlag bei Abweichung, Herkunft-Reset-Button im Spiegel (categorySource batch-geladen). Exakter Hash: siehe `git log`.

---

## [Unreleased] — G33: „Herkunft zurücksetzen"-Button erscheint jetzt zuverlässig (Reaktivitäts-Fix) (implementiert, Test auf Pi ausstehend)

Aus dem G32-Test: der Button erschien **nie**. Diagnose (Workflow):

- **Root-Cause (mein G32-Fehler):** Ich hatte die Kategorie-Herkunft in ein lokales `$state` (`catSource`)
  gespiegelt, das ein Seed-`$effect` nur bei `open`/`product.id`-Wechsel setzt — **nicht** an `fieldSources`
  gebunden. Der Artikel-Katalog liefert `fieldSources` aber **lazy per fetch** NACH dem Öffnen; das späte
  `category='manual'` erreichte den Effect nie → `catSource` blieb undefined → Bedingung nie erfüllt.
  (Die Detailseite hatte `fieldSources` synchron aus dem Load — dort hätte er erschienen.)
- **Fix:** Kein Prop-Spiegel mehr. Die Sichtbarkeit prüft jetzt **direkt reaktiv** `fieldSources.category === 'manual'`
  im Markup; der lokale State ist nur noch ein „nach Reset ausblenden"-Flag (`catSourceReset`). Damit erscheint der
  Button, sobald die (auch lazy geladene) Herkunft `manual` ist, und verschwindet sofort nach dem Reset.
- **Klarstellung (kein Bug):** Der zweite Test-Punkt — Regel greift bei einem NEUEN Artikel nach bloßem
  „Katalog **sichern**" nicht — ist erwartetes Verhalten: „Sichern" wendet nie etwas auf Artikel an (nur
  „Übernehmen"), und ein Artikel ohne Bestand/Markt-Zuordnung erscheint gar nicht als Übernahme-Kandidat im Spiegel.

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G32-Items präzisiert, G33-Verweis.

### Commits
G33 (dieser Commit) — Button-Sichtbarkeit reaktiv aufs fieldSources-Prop (statt gespiegeltem $state). Exakter Hash: siehe `git log`.

---

## [Unreleased] — G32: Manuellen Kategorie-Herkunfts-Schutz zurücksetzbar (wieder regel-empfänglich) (implementiert, Test auf Pi ausstehend)

Aus dem G31-Test (Folgewunsch): Eine Kategorie mit Herkunft `manual` war dauerhaft vor Mapping-Regeln geschützt —
es fehlte ein Weg, das aufzuheben, ohne den Artikel neu anzulegen.

- **Server:** neue `clearFieldSource(productId, field)` (löscht die `product_field_sources`-Zeile) + **DELETE**
  `/api/products/[id]/sources?field=category` (Feld gegen die 5 erlaubten Werte validiert). Danach gilt die Herkunft
  als „nicht erfasst" → der G31-Guard (`srcs.category !== 'manual'`) lässt Regeln/Auto-Match wieder zu. Der
  Kategorie-**Wert bleibt** unberührt.
- **UI:** `ProductForm` bekam ein optionales `fieldSources`-Prop und zeigt beim Kategorie-Feld — nur im Bearbeiten-
  Modus UND wenn die Herkunft `manual` ist — einen kleinen **„Herkunft zurücksetzen"**-Button (Tooltip erklärt:
  Wert bleibt, wird wieder regel-empfänglich). Klick → DELETE, Button verschwindet sofort, Toast.
- **Überall verdrahtet:** Detailseite reicht `data.fieldSources` an ProductForm; der Artikel-Katalog lädt die
  Herkunft **lazy** beim Öffnen des Edit-Modals (`GET …/sources`) — kein N+1 im Listen-Load. Damit ist der Button an
  allen Kategorie-Bearbeitungsstellen verfügbar (die alle über ProductForm laufen).

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: neuer G32-Block.

### Commits
G32 (dieser Commit) — clearFieldSource + DELETE-Endpoint, ProductForm „Herkunft zurücksetzen"-Button, überall verdrahtet. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G31: Mapping-Regel ordnet auch bestehende Artikel neu zu (Overwrite-Guard) (implementiert, Test auf Pi ausstehend)

Aus dem G29-Test: die Regel wirkte nur bei NEU angelegten Artikeln, nicht bei bestehenden mit schon gesetzter
Kategorie; „auf leer zurücksetzen + Katalog sichern" hatte keinen Effekt. Diagnose (Workflow):

- **Root-Cause:** Der Overwrite-Guard beim „Übernehmen" (`applySnapshotToProduct`) war
  `catId && (fields.category || !product.categoryId)`. Bei einem bestehenden Artikel mit Kategorie ist
  `!product.categoryId` = false → es hing allein am Kategorie-Haken, der standardmäßig aus ist → Regel/Auto-Match
  schrieb nie. Bei neuem Artikel (leere Kategorie) griff der Zweig, daher funktionierte es dort.
- **Fix (Vorrang manuell > Regel > Fallback bleibt exakt):** `matchCategoryId` unterscheidet jetzt via
  `matchCategoryWithSource`, ob der Treffer aus einer **Nutzer-Regel** stammt (`fromRule`). Ein Regel-Treffer darf
  auch eine **bestehende** Kategorie neu zuordnen — **außer** deren Herkunft ist `manual` (dann geschützt, via
  `getFieldSources`). Reiner Name/Slug-Fallback verhält sich unverändert (nur bei leerer Kategorie / mit Haken).
- **Klarstellung (kein Verhaltens-Umbau):** „Katalog sichern" sammelt nur Vorschläge (`recordSnapshot`) — die
  Zuordnung (auch per Regel) greift erst beim **Übernehmen**. Ein Hinweis in der Spiegel-Legende sagt das jetzt klar.
  (Der Nutzer hatte erwartet, dass „Sichern" schon zuordnet.)

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G29-2/3/5 präzisiert, G31-Verweis.

### Commits
G31 (dieser Commit) — Regel überschreibt bestehende (nicht-manuelle) Kategorie beim Übernehmen; Sichern-vs-Übernehmen-Hinweis. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G30: Kategorie-Regeln nachgebessert (Ziel-Anzeige + Token-Auswahl statt Raten) (implementiert, Test auf Pi ausstehend)

Aus dem G29-Test: die frisch angelegte Regel zeigte als Ziel „(gelöscht)", und der Token war blindes Freitext-Raten.

- **G30-1 (Ziel „(gelöscht)"):** Der POST gab die rohe Insert-Zeile **ohne `categoryName`** zurück; die Liste rendert
  `categoryName ?? '(gelöscht)'` → die frische Zeile fiel auf den Fallback (nach Reload war es korrekt). Fix:
  `createCategoryMapping` liefert `categoryName` mit (es lädt die Kategorie zur Validierung ohnehin) → die
  POST-Antwort ist sofort korrekt anzeigbar.
- **G30-2 (Token-Raten behoben):** Ein Token ist ein einzelnes **Globus-Pfad-Segment** (lowercase) bzw. ein ganzer
  **OFF-`en:`-Tag** — vorher musste der Nutzer ihn erraten. Jetzt bietet das Token-Feld ein **`<datalist>`** mit den
  **real vorkommenden** Werten: für Globus die distinct Pfad-Segmente aus den gesicherten Katalog-Snapshots des
  Haushalts (neue Query `listGlobusCategorySegments`, driver-agnostisch in JS geflattet), für OFF eine kuratierte
  Liste gängiger `en:`-Tags. Freitext bleibt möglich. Dazu ein Hinweistext, was ein Token je Quelle genau ist.
- Die Schnell-Regel im Katalog-Spiegel (G29) nahm schon immer das echte Segment — unverändert.

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137. Keine Migration. Manifest: G29-Items präzisiert, G30-Verweis.

### Commits
G30 (dieser Commit) — categoryName in POST-Antwort, Token-datalist aus echten Globus-Segmenten + kuratierten OFF-Tags. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G29: Automatische Kategorie-Mapping-Regeln — Stufe 3 (Kategorie-Ausbau abgeschlossen) (implementiert, Test auf Pi ausstehend)

Letzte Stufe des Kategorie-Ausbaus (Stufe 1 CRUD G24/G25, Stufe 2 Nesting G27/G28). Löst den ursprünglichen
G17-2-Schmerz („~1 von 100 mappt automatisch"): der Nutzer pflegt **editierbare Mapping-Regeln**, die beim
Barcode-Scan UND Katalog-Sync automatisch greifen.

- **Neue Tabelle `category_mappings`** (Migration 0019, household-scoped): `source ('off'|'globus')`, `token`
  (lowercase-normalisiert), `categoryId`; unique je (household, source, token). Kein Snapshot-File (wie 0017/0018).
- **Regel-Matching** (reiner Helfer `category-mapping-match.ts`, +6 Vitest): Match = **ganzer OFF-Tag / ganzes
  Globus-Pfad-Segment**, case-insensitiv (kein Substring). Globus-Segmente spezifischste-zuerst.
- **Automatisch, mit Vorrang manuell > Regel > Code-Fallback:** `resolveMappedCategory` greift in `resolveCategoryId`
  (OFF, barcode-Endpoint — jetzt mit householdId) und in `matchCategoryId` (Globus) **vor** dem eingebauten
  Map/Name-Slug-Fallback. Der manuelle Übernahme-Zweig aus G20-2 bleibt unangetastet Vorrang.
- **Verwaltung:** neue Seite `Einstellungen → Kategorie-Zuordnung` (Regeln anlegen/löschen, Quelle-Badge, Token →
  Zielkategorie mit Baum-Einrückung) + API `api/category-mappings` (GET/POST/DELETE, Auth, writeAudit, 409 bei Dup).
- **Schnell-Regel im Katalog-Spiegel:** bei einem Globus-Pfad einen „+ Regel"-Button, der aus dem spezifischsten
  Segment + der gewählten Kategorie direkt eine dauerhafte `globus`-Regel anlegt.

Gates: typecheck 0, lint 0/33, build ✓, vitest 137/137 (+6). **Migration 0019 in CI scharf.** Manifest: neuer G29-Block.

Damit ist der Kategorie-Ausbau abgeschlossen (CRUD → Nesting → Mapping-Regeln).

### Commits
G29 (dieser Commit) — category_mappings (Migration 0019), Regel-Matcher + Lookup, OFF/Globus-Einhängung, Verwaltungsseite + Schnell-Regel. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G28: Kategorie-Nesting-Feinschliff (Dropdown-Einrückung, Select-Höhe, Tooltip) (implementiert, Test auf Pi ausstehend)

Aus dem G27-Test: drei optische Nachbesserungen.

- **G28-1 (Dropdown-Einrückung sichtbar):** In den Kategorie-Dropdowns (Artikel-Formular, Katalog-Spiegel,
  Eltern-Auswahl) erschienen alle Optionen gleich — HTML **kollabiert führende Leerzeichen in `<option>`**. Fix:
  Einrückung jetzt mit **Non-Breaking-Spaces** (helper `optionIndent`/`catIndent`) → Unterkategorien sind sichtbar
  eingerückt (wie in der Verwaltungsliste, die per CSS einrückt).
- **G28-2 (Select-Höhe):** Das „Unterkategorie von"-`<select>` war ~200px hoch statt 40px — im Spalten-Flex
  (`.parent-field`) wurde `flex-basis: 200px` der geteilten `.input`-Regel zur **Höhe**. Fix: `.parent-field .input { flex: 0 0 auto; height: 40px }`.
- **G28-3 (Tooltip):** Der „Unterkategorie"-Tooltip hing nur am `↳`-Symbol → jetzt auf dem ganzen Kategorie-Feld
  (`title` am umschließenden Span, Detailseite + easy-add).

Gates: typecheck 0, lint 0/33, build ✓, vitest 131/131. Manifest: G27-1/G27-2 präzisiert, G28-Verweis.

### Commits
G28 (dieser Commit) — NBSP-Einrückung in Kategorie-Selects, Select-Höhe-Fix, Tooltip aufs Feld. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G27: Verschachtelte Kategorien (Nesting) — Stufe 2 des Kategorie-Ausbaus (implementiert, Test auf Pi ausstehend)

Stufe 2 des gestuften Kategorie-Ausbaus (Stufe 1 CRUD = G24/G25). Kategorien lassen sich jetzt **beliebig tief
verschachteln** (z.B. Getränke → Wasser → Sprudel). Keine Migration nötig — `categories.parentId` + Relations
existierten bereits, waren nur ungenutzt.

- **Baum-Helfer (neu, DB-frei):** `lib/utils/category-tree.ts` — `buildCategoryTree` (DFS → flache Liste mit `depth`,
  robust gegen verwaiste/zyklische Einträge), `isDescendant` (Zyklus-Schutz mit Besuchsschutz), `categoryDepth`.
  +11 Vitest.
- **Query/API:** `createCategory`/`updateCategory` + POST/PATCH nehmen jetzt `parentId`. `updateCategory` hat einen
  **Zyklus-Schutz** (eine Kategorie kann nicht sich selbst oder einem Nachkommen untergeordnet werden) → PATCH gibt
  **409** mit Klartext. `writeAudit` protokolliert `parentId`.
- **Kategorie-Verwaltung:** Liste als **eingerückter Baum**; Add- UND Edit-Formular haben ein
  **„Unterkategorie von …"-Dropdown** (Default: Oberkategorie). Beim Bearbeiten werden die Kategorie selbst + ihre
  Nachkommen aus dem Eltern-Dropdown ausgeschlossen (Client-Zyklus-Schutz zusätzlich zum Server-409).
- **Eingerückte Selects:** Der Kategorie-Select im Artikel-Formular (`ProductForm`) und im Katalog-Spiegel
  (Einstellungen) zeigt Unterkategorien eingerückt in Baum-Reihenfolge.
- **Wert-Anzeige:** wo eine Kategorie als Wert steht (Artikel-Detailseite, easy-add-Pill), signalisiert bei
  Unterkategorien ein vorangestelltes **↳** die Verschachtelung (nur Symbol + Name, kein voller Pfad).
- Löschschutz unverändert: Kategorie mit Unterkategorien → weiterhin 409. `categories` bleibt global (Design-Schuld).

Gates: typecheck 0, lint 0/33, build ✓, vitest 131/131 (+11). Manifest: neuer G27-Block.

### Commits
G27 (dieser Commit) — Baum-Helfer, parentId in Query/API + Zyklus-Schutz, Baum-UI + eingerückte Selects + ↳-Symbol. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G26: Räume/Lagerorte-Verwaltung vereinheitlicht (geteilter Emoji-Picker, Fächer-Icon, Toast) (implementiert, Test auf Pi ausstehend)

Aus dem G25-Test: die `/orte`-Seite soll dieselben Bausteine wie die Kategorie-Verwaltung nutzen — uniforme
Darstellung, bestehende Features wiederverwenden statt duplizieren.

- **Geteilter Emoji-Picker statt Duplikat:** `/orte` hatte einen eigenen, **4× duplizierten** Inline-Picker mit
  eigenem Emoji-Set. Ersetzt durch die geteilte `EmojiPicker.svelte` (eine Instanz, `emojiPickerFor`-State) —
  identisches Such-Modal wie bei Kategorien.
- **Kontextabhängige Vorschläge:** `EmojiPicker` bekam einen `context`-Prop (`'category'|'place'`). Die Emoji-Daten
  (`category-emojis.ts`) tragen jetzt eine `group` (`food|place|general`) + neue Raum-/Möbel-Emojis (🏠🍳🛋️🛏️🗄️🧊❄️…
  mit deutschen Keywords). Ohne Suche zeigt der Picker die passende Gruppe zuerst (`emojisByContext`); die **Suche
  findet weiterhin alles**.
- **Fächer-Icon ergänzt:** Fächer (`places`) hatten in der UI kein Icon — obwohl DB + API es längst unterstützen.
  Jetzt beim Anlegen/Bearbeiten wählbar; die Fach-Chips zeigen das Icon.
- **Toast vereinheitlicht:** das lokale Toast-System der `/orte`-Seite entfernt, jetzt der geteilte
  `$lib/stores/toast` (wie überall sonst).
- Accordion/Struktur/Layout unverändert; kein Server-/DB-Change, keine Migration.
- **Tests:** `emojisByContext` + erweiterte `filterEmojis`-Abdeckung (vitest 120, +3).

Gates: typecheck 0, lint 0/33, build ✓, vitest 120/120. Manifest: neuer G26-Block.

### Commits
G26 (dieser Commit) — geteilter Emoji-Picker in /orte, Kontext-Vorschläge, Fächer-Icon, Toast vereinheitlicht. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G25: Kategorie-Nachbesserungen — Emoji-Picker + Löschen im Edit-Modus (implementiert, Test auf Pi ausstehend)

Aus dem G24-Test: Icon-Freitextfeld unbrauchbar (Text-Symbol ❄ sah anders aus als die Farb-Emoji der Basis-Kategorien); Löschen-Button im Bearbeiten-Modus nicht auffindbar.

- **G25-1 (Löschen auch im Edit-Modus):** Der Löschen-Button steht jetzt sowohl in der Zeile (neben „Bearbeiten")
  ALS AUCH im Bearbeiten-Panel (neben „Speichern"/„Abbrechen") — dort hatte der Nutzer ihn gesucht. Für die 9
  Basis-Kategorien bleibt er ausgeblendet (löschgeschützt). Die Server-Löschlogik war korrekt; es war ein reines
  Auffindbarkeits-Problem der UI.
- **G25-2 (Emoji-Picker-Modal mit Suche):** Das Freitext-Icon-Feld ist durch einen **Icon-Button + Picker-Modal**
  ersetzt (neu `EmojiPicker.svelte`). Der Picker zeigt eine kuratierte, durchsuchbare Sammlung von **Farb-Emojis**
  (neu `lib/data/category-emojis.ts` mit Keyword-Suche, deutsch/englisch) — jedes garantiert ein Farb-Emoji, keine
  monochromen Text-Symbole wie ❄. Das behebt das uneinheitliche Aussehen. Beim Anlegen UND Bearbeiten nutzbar.
- **Tests:** `filterEmojis` (vitest 117, +4).

Gates: typecheck 0, lint 0/33, build ✓, vitest 117/117. Manifest: G24-2/G24-4 präzisiert, neuer G25-Block.

### Commits
G25 (dieser Commit) — EmojiPicker-Modal + kuratierte Emoji-Daten, Löschen im Kategorie-Edit-Modus. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G24: Kategorie-Verwaltung (CRUD) — Stufe 1 des Kategorie-Ausbaus (implementiert, Test auf Pi ausstehend)

Erster Schritt des gestuften Kategorie-System-Ausbaus (Stufe 1 CRUD → Stufe 2 Nesting → Stufe 3 Mapping-Regeln).
Ziel des Gesamtausbaus: das schwache Auto-Mapping (G17-2) durch pflegbare Kategorien + spätere Mapping-Regeln lösen.

- **Neue Seite `Einstellungen → Kategorien`:** Kategorien anlegen, umbenennen (+ Icon), löschen — analog zur
  Einheiten-Verwaltung (Liste, Inline-Edit, ConfirmModal, `toast`).
- **Server:** neues Query-Modul `queries/categories.ts` (list/create/update/delete) + reine Helfer in
  `category-slug.ts` (DB-frei, unit-testbar); API `api/categories` (GET/POST) + `api/categories/[id]` (PATCH/DELETE),
  jeweils mit Auth + `writeAudit`. Slug wird serverseitig aus dem Namen erzeugt (Umlaut-Transliteration,
  Kollisions-Suffix). `sortOrder` = max+1.
- **Schutzregeln:** die 9 Basis-Kategorien (Seed-Slugs) sind umbenennbar, aber **nicht löschbar**; Kategorien mit
  zugeordneten Artikeln oder (vorwärtskompatibel) Unterkategorien → **409** mit Klartext.
- **Hinweis (Design):** `categories` ist global (kein `household_id`) — CRUD wirkt haushaltsübergreifend; bei einem
  Haushalt unkritisch, in der ROADMAP als Design-Schuld vermerkt (analog EAN global unique).
- **Tests:** `slugify`/`isSeedCategorySlug` (vitest 113, +6).
- Nesting (beliebig tief, Rekursionsschutz) und automatische Mapping-Regeln folgen als eigene Stufen.

Gates: typecheck 0, lint 0/33, build ✓, vitest 113/113. Manifest: neuer Block „Kategorie-Verwaltung".

### Commits
G24 (dieser Commit) — Kategorie-CRUD-Seite + API + Query-Modul + Slug-Helfer/Tests. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G22: Kategorie bleibt nach Reload sichtbar + Soll-Bestand ohne Einheiten-Feld (implementiert, Test auf Pi ausstehend)

Aus dem G21-Test: manuelle Kategorie im Katalog-Spiegel fiel nach Reload auf „— Kategorie wählen —" zurück; Soll-Bestand-Dialog hatte ein überflüssiges Einheiten-Feld. Diagnose (Workflow):

- **G22-1 (Kategorie fällt nach Reload zurück — anderer Bug als G21-2):** Die manuelle Wahl **wird korrekt
  persistiert** (`product.categoryId`, Herkunft `manual`) — der Spiegel **las sie nach Reload nur nicht zurück**.
  Das Select-Fallback nutzte ausschließlich den Auto-Match (`snap.catalogCategoryId`); war der null, zeigte es
  „— Kategorie wählen —", obwohl der Artikel eine gesetzte Kategorie hatte. Fix: `snapCategoryFor` fällt jetzt
  in der Reihenfolge **manuelle Wahl → gespeicherte `r.product.categoryId` → Auto-Match → leer** zurück; die
  Checkbox-`disabled`-Bedingung und ein neuer Status-Tag **„gesetzt"** nutzen denselben Wert. Damit steht die
  übernommene Kategorie nach Reload sichtbar im Dropdown. (Rein Frontend; Persistenz war schon korrekt.)
- **G22-2 (Soll-Bestand-Dialog: Einheiten-Feld raus):** Auf Nutzer-Wunsch — Einheiten gehören an Artikel/Bestand,
  nicht in jeden Dialog. Das Einheiten-`<select>` im „Soll-Bestand festlegen"-Modal ist entfernt. Die Soll-Einheit
  kommt jetzt aus dem bestehenden Soll (unverändert) bzw. der Artikel-Standard-Einheit; die Soll-Menge zeigt die
  Einheit als Label-Hinweis („Soll-Menge in Stück"). `compareToTarget` und der PUT-Endpoint bleiben unberührt
  (Einheit wird weiter mitgesendet, nur nicht mehr editiert).

Gates: typecheck 0, lint 0/33, build ✓, vitest 107/107. Manifest: G21-2/G17-2 präzisiert, neuer G22-Block.

### Commits
G22 (dieser Commit) — Kategorie-Select-Fallback auf gespeicherte categoryId, Soll-Dialog ohne Einheiten-Feld. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G21: „piece"-Anzeige geheilt + „Alle angleichen"-Blocker + Kategorie-Spiegel-Reaktivität (implementiert, Test auf Pi ausstehend)

Aus dem G20-Test: „Gesamtbestand 10 piece" ließ sich nicht ändern; manuelle Kategorie-Wahl blieb rot + Select zeigte „keine Auswahl". Diagnose (Workflow) korrigierte meine bisherige Fehlannahme:

- **G21-1 (der eigentliche „piece"-Bug — bisher an der FALSCHEN Stelle gesucht):** „Gesamtbestand 10 piece"
  ist die **Bestands-Einheit** (`inventory_items.unit`), NICHT `products.defaultUnit`. Meine G19/G20-Fixe an der
  Standard-Einheit konnten diesen Wert gar nicht berühren. Zwei Ursachen behoben:
  - **Anzeige:** `formatStockTotal` zeigte für count-Gruppen das **Roh-Symbol** „piece" statt des Namens „Stück".
    Jetzt: count → aufgelöster Name (`displayName`, z.B. „Stück"), mass/volume weiterhin Symbol (kg/g/ml/l).
  - **„Eier festgefroren":** `openNormalizeModal` (der „Alle angleichen…"-Dialog, der Artikel **und alle Bestände**
    auf eine Einheit setzt) belegte die Zieleinheit mit `product.defaultUnit` vor — war das ein verwaister Wert
    (orphan „piece"), blieb das `<select>` darauf hängen und der Server lehnte mit 400 „Unbekannte Einheit" ab.
    Deshalb ging es bei anderen Artikeln, bei den Eiern nicht. Jetzt wird **nur ein gültiger** Wert vorbelegt
    (erste Einheit, falls `defaultUnit` nicht in der Liste). Zusammen mit Migration 0018 (G20) ist „Alle angleichen"
    damit der zuverlässige Weg, „10 piece" auf jede Einheit zu setzen.
- **G21-2 (mein G20-Kategorie-Feature war buggy):** Nach manueller Kategorie-Wahl im Katalog-Spiegel blieb der
  Status-Tag rot („nicht zuordenbar") und das Dropdown zeigte weiter „— Kategorie wählen —". Ursachen:
  (1) `snapCategoryChoice` war ein **untracked** plain object → die Template-Bedingung war nicht reaktiv; jetzt `$state`
  → der Tag wechselt auf **„manuell"**. (2) Der Select-Wert wird jetzt reaktiv aus `$state` gelesen und mit der
  Auto-Match-Kategorie als Fallback vorbelegt → die gewählte (bzw. automatisch erkannte) Kategorie steht sichtbar drin,
  nicht mehr generisch „keine Auswahl".
- **Regressionstests:** count-Einheit „piece → Stück" + Fallback auf Symbol bei unbekannter Einheit (vitest 107).

Gates: typecheck 0, lint 0/33, build ✓, vitest 107/107 (2 neu). Manifest: G20-1/G20-4 präzisiert, neuer G21-Block.

### Commits
G21 (dieser Commit) — count-Einheit als Name, Angleichen-Vorbelegung nur gültig, Kategorie-Spiegel $state+reaktiv. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G20: Standard-Einheit entklemmt + Kategorie manuell überschreibbar (implementiert, Test auf Pi ausstehend)

Aus dem G19-Test: zwei nicht erfüllte Punkte, **beide durch meine G19-Arbeit verursacht**. Diagnose (Workflow):

- **G20-1 (Standard-Einheit klebt auf „piece" — meine G19-Regression):** Mein G19-„Fix" (synthetische
  Fallback-Option im Einheiten-`<select>`) hat den Fehler nicht behoben, sondern **eingefroren**. Wahre
  Ursache: `product.defaultUnit='piece'` war im Haushalt **nicht in der `units`-Liste** (System-Einheit fehlte
  — INSERT aus Migration 0002 lief in dem DB-Stand nicht sauber). Folge: rohes „piece" statt „Stück", und meine
  Fallback-Option band den Wert stabil an Position 0 → nicht mehr änderbar. Dreifach behoben:
  (1) **Migration 0018** trägt die 9 System-Einheiten (`piece/g/kg/ml/l/Packung/Dose/Flasche/Tetrapak`)
  **strikt idempotent** nach (`WHERE NOT EXISTS` je Symbol, kein Overwrite, dimension/Faktor gesetzt).
  (2) **UI-Härtung:** Fallback-Option entfernt; `startUnitEdit` bindet nur noch gültige Einheiten; ein verwaister
  Ist-Wert wird als „unbekannte Einheit" markiert und zwingt zur Neuwahl.
  (3) **Server-Validierung:** `PATCH /api/products/[id]` lehnt eine `defaultUnit` ab (400), die nicht in der
  `units`-Tabelle des Haushalts existiert — so kann sich nie wieder ein verwaister Wert festsetzen.
- **G20-2 (Kategorie manuell überschreibbar — die eigentliche, in G19 verfehlte Anforderung):** Statt nur
  „nicht zuordenbar" anzuzeigen (wertlos), gibt es jetzt im **Katalog-Spiegel** je Artikel ein **Dropdown über
  alle stoqr-Kategorien**. Auto-Match bleibt Vorbelegung; wählt der Nutzer manuell, wird die Kategorie
  serverseitig validiert, übernommen und mit Herkunft **`manual`** gesetzt — ein späterer Globus-Sync
  überschreibt die manuelle Wahl damit **nicht**. Die manuelle Wahl aktiviert die Übernahme-Checkbox automatisch.
- **Klarstellung/Ehrlichkeit:** Der „Commit failed"-Eindruck bei G19 (`ec7b405`) war ein CI-**concurrency-cancel**
  durch den unmittelbar folgenden Doku-Commit — der Docker-Publish lief erfolgreich, das Image `:main` enthielt
  den Code. Ab G20 wird der Hash-Nachtrag in denselben Commit gezogen, damit sich nichts cancelt.

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G19-1/G17-2/G19-2/G19-3 als in G20 nachgebessert markiert, neuer G20-Block.

### Commits
G20 (dieser Commit) — Einheit-Migration 0018 + Server-Validierung, Fallback-Option zurückgebaut, manuelles Kategorie-Dropdown im Katalog-Spiegel mit Herkunft manual. Exakter Hash: siehe `git log`.

---

## [Unreleased] — G19: Standard-Einheit-Header-Regression + Kategorie-Mapping-Fix (implementiert, Test auf Pi ausstehend)

Aus dem G18-Test: harte Regression beim Ändern der Standard-Einheit + fälschlich als „gleich" gewertete, nicht existente Kategorie.

- **G19-1 (Standard-Einheit-Header — harte Regression):** Das `<select bind:value>` für die Standard-Einheit setzt
  sich in Svelte 5 auf die **erste Option** zurück, wenn der gebundene Ist-Wert nicht unter den Optionen war — dadurch
  zeigte der Header nach dem Speichern „piece" (bzw. brauchte ein Reload). Fix: (a) das Select rendert eine
  **Fallback-Option** für den aktuellen `product.defaultUnit`, falls dieser nicht in der Einheiten-Liste ist, sodass der
  Ist-Wert immer selektierbar bleibt; (b) `saveDefaultUnit` **guardet gegen Leerwerte** (kein Speichern eines
  Leer-/Falschwerts, stattdessen Hinweis). Reseed nach `invalidateAll` weiterhin aus `data.*`, nicht aus `$derived`.
- **G19-2 (Kategorie fälschlich „gleich" + totes Mapping):** Zwei Ursachen. (1) Die `OFF_CATEGORY_MAP`/
  `OFF_CATEGORY_KEYWORDS` im Barcode-Endpunkt zeigten auf **nicht existente** Slugs (`meat`, `fish`, `fruits`, `frozen`,
  `desserts`, `pasta`, …) → die Kategorie wurde nie aufgelöst. Jetzt zeigen sie ausschließlich auf die **9 echten
  Seed-Slugs** (`fruits-vegetables`, `dairy`, `meat-fish`, `bakery`, `canned-frozen`, `beverages`, `snacks`,
  `condiments`, `other`). (2) `matchCategoryId` (Globus) prüfte nur das **letzte** Pfad-Segment gegen den Namen; jetzt
  werden **alle Segmente** (spezifischste zuerst) gegen **Name UND Slug** geprüft. (3) Der Katalog-Spiegel in den
  Einstellungen wertete einen rohen Globus-Kategorie-Pfad, der auf keine stoqr-Kategorie mappt, fälschlich als „gleich".
  Jetzt gibt es einen **dritten Status „nicht zuordenbar"** (roter Tag + Hinweis „keine passende stoqr-Kategorie"), und
  die Übernahme-Checkbox bleibt in dem Fall gesperrt. Die Übernahme auf **existierende** Kategorien läuft über das
  robustere `matchCategoryId`.
- **G19-3 (Backlog):** Gebinde-Nesting („1 Packung = 18 Riegel à 21 g", 2-stufige Kette, größter Nutzen bei
  „Alle angleichen"/convert) und eine **editierbare Kategorie-Mapping-Tabelle** (+ optional nested Kategorien) sind als
  Backlog in die ROADMAP aufgenommen — bewusst NICHT jetzt gebaut (Nutzer-Entscheidung).

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G15-4/G17-2 geschärft, neue G19-Items.

### Commits
ec7b405 (G19 — Standard-Einheit-Header-Fix, Kategorie-Mapping auf echte Seed-Slugs, „nicht zuordenbar", Backlog)

---

Aus dem G17-Test: Katalog zeigt wieder nur Preis, Katalog-Sync übernimmt nichts, Bilder-404 trotz Volume-Fix. Regressions-Jagd (Workflow):

- **G18-1 (Bild-uid — mein Fehler in G17):** Meine chown-Anleitung `1000:1000` war falsch. Der Container-User wurde
  per `adduser -S stoqr` **ohne feste uid** angelegt; `node:alpine` belegt 1000 bereits mit `node` → `stoqr` bekam
  eine andere uid → kein Schreibrecht im gemounteten `/data/media` → Bild-Download schlug still fehl → 404. Fix:
  Dockerfile pinnt jetzt **uid/gid 1001** (`adduser -u 1001`); entrypoint + Compose + Anleitung auf 1001. Nutzer muss
  einmalig neues Image ziehen + `chown -R 1001:1001` auf dem Pi (Rollback des falschen 1000 — Anleitung im Chat).
- **G18-2 (Katalog zeigt nur Preis — Folge von G17-2):** Weil OFF jetzt Name/Kategorie befüllt, waren Artikel- und
  Katalog-Wert gleich → der Abweichungs-Diff blendete die Zeilen aus. Umgesetzt wie ursprünglich (G10) vom Nutzer
  gefordert: der Katalog-Spiegel zeigt **IMMER alle Felder** (Name/Bild/Kategorie/Preis) mit Artikel- und Katalog-Wert
  + Herkunft; abweichende sind markiert/vorausgewählt, übereinstimmende abgedunkelt mit „gleich". Kein Ausblenden mehr.
- **G18-3 (verlorene Bilder — Selbstheilung):** Bilder, deren DB-Referenz auf eine (nach altem Update) verlorene Datei
  zeigt, wurden nie neu geladen. Der `/media`-Handler lädt bei fehlender Datei jetzt einmalig on-demand aus dem
  neuesten Snapshot-`imageRemoteUrl` derselben EAN nach — kein dauerhaftes 404 für Alt-Referenzen.
- **Klarstellung:** Marke + Einheit kann der Globus-Katalog fachlich NICHT liefern (nur Name/Preis/Kategorie/Bild im
  Suggest) — die kommen nur von OFF/manuell. Katalog-Sync übernimmt zudem nur Artikel, die einem Markt mit Abruf-URL
  zugeordnet sind und deren EAN Globus führt.

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G17-1 (uid 1001) + neuer G18-Block.

### Commits
eaae112 (G18 — Katalog-immer-alle-Felder, uid 1001, Bild-Selbstheilung)

---

## [Unreleased] — G17: Kategorie-Mapping robuster + Bild-Persistenz (Volume-Fix) (implementiert, Test auf Pi ausstehend)

Aus dem G16-Test: G15-4 (Kategorie) + Bilder-404-nach-jedem-Update. Diagnose (Workflow):

- **G17-1 (Bild-Verlust bei jedem Update — echter, kritischer Fund):** Die auf dem Pi deployte
  `docs/docker-compose.fam.ily.yml` hatte für den stoqr-Service **keinen Volume-Mount für `/data/media`** — nur
  Postgres. Bilder lagen im flüchtigen Container-Layer und verschwanden bei **jedem** Image-Update (Container-Ersatz).
  Die 404s + die `preload`-Warnung waren Symptome davon. Fix: Bind-Mount `/srv/hubdata/state/stoqr/media:/data/media`
  ergänzt; entrypoint prüft Schreibbarkeit und weist auf `chown 1000:1000` hin. **Nutzer muss die Compose-Datei
  einmalig auf dem Pi ersetzen + `chown` setzen**, dann sind Bilder persistent. (Die frühere G13-3-„Milderung" hatte
  nur das Symptom berührt — die Ursache war ein fehlender Mount.)
- **G17-2 (Kategorie greift jetzt):** `resolveCategoryId` matchte OFF-`categories_tags` nur exakt gegen 14 grobe
  Top-Level-Tags → reale spezifische Tags (`en:sodas`, `en:yogurts`, …) verfehlten fast immer → `categoryId` blieb
  leer. Neu: Keyword-Fallback (Substring-Matching, ~40 Begriffe → Kategorie) nach dem Exakt-Match.
- **G17-3 (easy-add zeigt Kategorie-Wert):** Der „Bestand hinzufügen"-Pill zeigte nur die Kategorie-*Herkunft* („Kat. ?"),
  nie den Wert → wirkte kaputt. Jetzt: Kategorie-Wert (Icon + Name) mit Herkunfts-Badge, bzw. „Keine Kategorie". Der
  `/api/products/[id]/sources`-Endpoint liefert dafür zusätzlich das Kategorie-Objekt (füllt es auch nach Barcode-Scan).

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G15-4 geschärft + neuer G17-Block.

### Commits
91e7628 (G17 — Kategorie-Mapping-Fallback, easy-add-Kategorie-Wert, Media-Volume-Mount)

---

## [Unreleased] — G16: Feinschliff nach G15-Test (implementiert, Test auf Pi ausstehend)

Aus dem G15-Test: 3 offene G15-Punkte + 2 gefundene Bugs + Modell-Fragen (die keine Änderung erforderten).

- **G16-1 (Badges immer):** `SourceBadge` zeigte bei fehlender Herkunft nichts → Altartikel ohne erfasste Quelle
  hatten gar kein Badge. Jetzt: neutrales „?"-Pill (Tooltip „Herkunft nicht erfasst"). Bild-Herkunft-Zeile hängt
  an `product.imageUrl` statt an erfasster Quelle.
- **G16-2 (easy-add Herkunft generell):** Der OFF-Hinweis erschien nur nach Kamera-Scan. Neuer Endpoint
  `GET /api/products/[id]/sources`; „Bestand hinzufügen" lädt beim Auswählen (Suche/Scan/Katalog) die Feld-Herkunft
  und zeigt Badges im Auswahl-Pill — generell, nicht nur nach Scan.
- **G16-3 (Modal-Bug):** Modals schlossen beim Text-Markieren, wenn die Maus dabei aus dem Modal gezogen wurde
  (Backdrop-`onclick` feuerte). Fix in `Modal.svelte` + `ProductForm.svelte`: Schließen nur, wenn `pointerdown`
  **und** `click` beide auf dem Backdrop selbst (`e.target === e.currentTarget` + Down-Flag). Deckt alle Dialoge ab.
- **G16-4 (Nährstoff-Sortierung):** Der Loader sortierte Nährwerte nach UUID (zufällig). Jetzt hierarchisch nach
  `nutrient_types.sortOrder`/`parentId` — Unterzeilen („davon Zucker/ges. Fettsäuren") direkt unter ihrem Oberbegriff
  und eingerückt. Custom-Typen bekommen `sortOrder=900` (nach den Seed-Typen).
- **Modell-Fragen beantwortet (kein Code):** 1 EAN = 1 globales Produkt (GS1); verschiedene Gebinde haben eigene EANs;
  Preis/Verfügbarkeit markt-abhängig, Produkt global; Katalog-Diff klammert die EAN bewusst aus. Doku-Notiz + Backlog
  (Pfand/Leergut, günstigster Preis, Dubletten) in ROADMAP gepflegt.

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G15-1/-4 geschärft + neuer G16-Block.

### Commits
f004ab1 (G16 — Badges immer, easy-add-Herkunft, Modal-Fix, Naehrstoff-Sortierung)

---

## [Unreleased] — G15: Feld-Provenienz (OFF / Globus / manuell) für Artikel-Stammdaten (implementiert, Test auf Pi ausstehend)

Nutzer-Klarstellung nach dem Bild-Debakel: OFF darf beim initialen Anlegen alles liefern, aber **jedes Feld muss
seine Herkunft explizit tragen**, und Markt-Daten (Globus) sollen die OFF-Werte **selektiv, feldweise** ersetzen.
Kernprinzip: OFF = initiale Basis → bei Bedarf feldweise mit Markt-Daten aktualisieren.

- **Datenmodell:** neue Tabelle `product_field_sources(product_id, field, source, updated_at)` (Migration 0017,
  analog `product_nutrients`; `field` ∈ name/brand/image/category/unit; `source` ∈ 'off'|'globus'|'manual'). Additiv,
  kein Backfill — fehlende Zeile = keine Herkunft (UI zeigt kein Badge). Query-Helper `setFieldSources`/`getFieldSources`.
- **Schreibpfade setzen die Quelle:** OFF-Anlegen (`api/barcode`) → gelieferte Felder 'off' (Bild nur, wenn das
  gespeicherte Bild wirklich das OFF-Bild ist); Globus-Katalog (`applySnapshotToProduct`/`materializeSnapshotToProduct`)
  → übernommene Felder 'globus'; manueller PATCH (`api/products/[id]`) → **nur tatsächlich geänderte Felder** 'manual'
  (Server-Diff before↔patch); manuelles Anlegen (POST) → 'manual'; easy-add-Neuanlage → 'off' (Scan-Herkunft).
- **UI:** neue `SourceBadge.svelte` (OFF/Globus/manuell-Pill). Detailseite-Header zeigt je Feld (Name/Marke/Kategorie/Bild)
  die Herkunft; der Nährwert-Badge (G12-3) nutzt jetzt dieselbe Komponente. Katalog-Spiegel bekommt die Legende
  „Aktueller Wert → Globus-Katalog". easy-add zeigt am gescannten Artikel „Stammdaten von OpenFoodFacts".
- **Bild-Regel (bestätigt):** OFF initial, Globus nur per Abgleich wählbar — nie automatisch (G14-2 bleibt).

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: neuer G15-Block. (Merkregel stale-$derived-Reseed
als Projekt-Notiz festgehalten.)

### Commits
f67fa2e (G15 — product_field_sources, SourceBadge, Schreibpfade, Katalog-Legende, easy-add-Hinweis)

---

## [Unreleased] — G14: Vier Regressionen aus G12/G13 behoben (implementiert, Test auf Pi ausstehend)

Nach dem G13-Deploy vier Symptome gemeldet — drei davon direkte Folgen meiner G12/G13-Änderungen. Diagnose (Workflow), am Code verifiziert:

- **G14-1 (Nährwerte „übernommen", aber nichts sichtbar):** Der Server-Cache-Bypass (G13-1) war korrekt — aber
  `fetchNutrientsFromOff` reseedete `nutrientRows` nach `invalidateAll()` aus dem **$derived `product`** (hält noch
  den alten Wert) statt aus `data.product` (frisch). Dieselbe stale-state-Lehre wie G6-3/G9-1. Fix: aus
  `data.product.nutrients` reseeden. Zusätzlich ehrliche Meldung, wenn OFF für die EAN gar keine Nährwerte hat.
- **G14-2 (Artikel bekam plötzlich ein schlechteres Bild):** Der Barcode-/easy-add-Pfad überschrieb `imageUrl`
  **immer** mit dem OFF-`image_url` (oft ein Community-Foto) — auch wenn der Artikel schon ein professionelles
  Globus-`/media`-Bild hatte. Fix: OFF-Bild nur setzen, wenn der Artikel **kein** Bild hat (`cached.imageUrl ?? …`
  bzw. `coalesce` im onConflict). Vorhandene Bilder bleiben.
- **G14-3 (Artikel dauerhaft „abweichend", Panel aber leer):** Folge von G14-2 (OFF-http-Bild ≠ `/media`-Snapshot
  → `image.differs` dauerhaft) PLUS ein UI-Race: das „abweichend"-Badge prüfte nur `diff.any`, das Aufklapp-Panel
  zusätzlich `snapFields[id]`, das per `$effect` erst nach dem ersten Render gefüllt wurde → Badge und Panel
  widersprachen sich. Fix: `snapFields` als `$derived.by` (sofort vorhanden, kein Race) mit untracked
  User-Toggle-Overlay; Gate ohne `snapFields`-Guard. Mit G14-2 verschwindet auch die Dauer-Abweichung.
- **G14-4 (unterschiedlich große Inventar-Karten):** Kein neuer Bug, aber durch das G13-3-`no-store`-404 sichtbarer.
  Fix: `.item-name` reserviert 2 Zeilen (`min-height`); `<img>` bekommt `onerror`-Fallback (versteckt Broken-Image).

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105.

### Commits
2eaa713 (G14 — Naehrwert-Reseed, Bild-Overwrite, Badge-Panel-Race, Kartenhoehe)

---

## [Unreleased] — G13: OFF-Nährwert-Refresh-Bug + Katalog-Preis-Vorschlag + Bilder-404 (implementiert, Test auf Pi ausstehend)

G12-Test 97/98 + drei Beobachtungen. Diagnose (Workflow):

- **G13-1 (der gemeldete Bug):** „Von OpenFoodFacts abrufen" tat nach manueller Änderung/Löschung **nichts** mehr.
  Ursache: `/api/barcode/[gtin]` hat einen 7-Tage-Cache (`offFetchedAt`) — nach dem ersten Abruf lieferte der
  Handler den DB-Stand (inkl. der manuellen Werte) zurück, ohne OFF-Fetch/Upsert. Fix: neuer `?refresh=nutrients`
  umgeht den Cache und frischt **nur die Nährwerte** auf (Stammdaten Name/Bild/Kategorie bleiben unangetastet).
  Der Detailseiten-Button sendet den Parameter. Erneuter Abruf überschreibt jetzt manuelle Werte; gelöschte kommen zurück.
- **G13-2 (Katalog-Preis übernehmbar):** Der Katalog-Spiegel übernahm den Globus-Preis nicht. Neu: `fields.price`
  in `applySnapshotToProduct` → legt den Snapshot-Preis als **Preis-Vorschlag** an (`recordProposedPrice`, F2-Flow,
  Staging bleibt) — nur wenn `priceCt != null && storeId != null` (Markt-Bezug; bei Sync-Snapshots gegeben,
  easy-add-Snapshots ohne Markt ausgeschlossen). UI: Preis-Diff-Zeile mit Checkbox im Spiegel. Der übernommene
  Preis erscheint als Vorschlag auf der Detailseite, wird nach Bestätigung estimate-wirksam. NICHT in `inventory_items`
  (Charge-Preis bleibt getrennt). `listCatalogMirror` liefert dafür `snapshot.storeId` mit.
- **G13-3 (Bilder-404):** Bilder werden lazy geladen (Sync/Suche); nach Pull mit leerem Volume → 404 bis Nachladen
  (kein Bug, kein Service-Worker). Milderung: 404 des `/media`-Endpunkts trägt jetzt `Cache-Control: no-store`,
  damit ein Retry nach dem Nachladen nicht durch einen Zwischencache blockiert wird.
- **Nährwerte im Katalog:** bewusst getrennt gelassen (Globus liefert keine; nur OFF via Detailseiten-Button).
  Allergene weiterhin ungebaut. (Nutzer-Entscheidungen.)

Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105. Manifest: G13-1 + G13-2, G12-3 unverändert.

### Commits
6d369a6 (G13 — OFF-Refresh-Bypass, Katalog-Preis-Vorschlag, Bilder-404)

---

## [Unreleased] — G12: Nährwert-Abruf repariert (Slug-Bug) + Herkunft + Abruf auf Artikelebene (implementiert, Test auf Pi ausstehend)

Wunsch: Nährwerte „abruf- und pflegbar wie beim Preis". Bestandsaufnahme ergab: Nährwerte waren bereits
abrufbar (OFF via `/api/barcode/[gtin]`) + manuell pflegbar. Entscheidungen: kein Vorschlag-Staging (OFF liefert
ganze Sets, direkt übernehmen), keine Allergene (keine normalisierte Quelle), Slug-Chaos bereinigen.

- **G12-1 (Kern-Bug):** Der OFF-Abruf **verwarf Nährwerte stillschweigend.** `api/barcode/[gtin]` las die OFF-Werte
  korrekt per `offKey`, gab sie aber mit einem eigenen, falschen Slug (`fat`, `energy-kcal`, …) weiter; der
  Nutrient-Type-Lookup per `slug` fand die Seed-Typen (`fat_total`, offKey `fat_100g`) nie → `continue` → Wert weg.
  Zusätzlich fehlten 4 der 12 Seed-Typen im Map. Fix: **Lookup läuft jetzt über `nutrient_types.off_key`** (die
  Seed-Wahrheit) statt über divergierende Slugs; `OFF_NUTRIENT_MAP` auf alle 12 Typen erweitert. Extraktion +
  Map in reine, getestete `off-nutrients.ts` ausgelagert (7 neue Vitest, inkl. Map↔Seed-Vertrag). **Keine
  Datenmigration nötig** (Werte wurden gedroppt, nicht falsch gespeichert).
- **G12-2:** Tote `NutrientTable.svelte` (dritte, deutsche Slug-Konvention, nirgends importiert) gelöscht → nur
  noch EINE Slug-Konvention im Repo.
- **G12-3:** Artikel-Detailseite: Button „Von OpenFoodFacts abrufen" (Nährwert-Abruf jetzt auch auf Artikelebene,
  nicht nur beim Scannen); je Nährwert ein Herkunft-Badge „OFF"/„manuell" (aus `product_nutrients.source`);
  manuelles Überschreiben setzt die Zeile auf „manuell".

Preis-Staging und Allergene bewusst nicht gebaut (Nutzer-Entscheidung). Gates: typecheck 0, lint 0/33, build ✓, vitest 105/105.
Manifest: neuer G12-Block.

### Commits
003d277 (G12 — OFF-offKey-Lookup, Herkunft-Badge, Artikel-Abruf)

---

## [Unreleased] — G11: Einheitliche Artikel-Bearbeitung + 2 echte Bugs (implementiert, Test auf Pi ausstehend)

Aus dem G10-Test: 4 offene Punkte. Diagnose (2 Workflows) klärte:
- **Preis-„Duplikat" — keine Änderung.** User vermutete redundante Preisfelder. Faktisch (ROADMAP:93): kein
  Preisfeld auf `products`; `product_prices` = Marktpreis je Markt (trägt das Estimate), `purchasePriceCt` =
  Charge-Ist-Beleg. Kein Duplikat. Preis-Modell bleibt bewusst unangetastet (User-Entscheidung).
- **G11-1 — gemeinsame vollständige Artikel-Bearbeitung.** Bisher drei divergierende Editier-Orte, keiner
  vollständig; Detailseite ohne EAN/Bild-Edit (nur Placeholder-SVG). Neu: `ProductForm.svelte` (Name, Marke, EAN,
  Kategorie, Bild, Standard-Einheit, Beschreibung) — eingebunden in Einstellungen→Artikel (Edit + Anlegen) und
  Detailseite („Bearbeiten", zeigt jetzt das echte `product.imageUrl`). API-Lücken geschlossen: `updateProduct`
  um `brand`, PATCH-Handler liest `brand`+`imageUrl`. EAN-Duplikat → klare 409-Meldung.
- **G11-2 — {EAN}-Client-Guard (Märkte).** `isValidHttpUrl` prüfte nur http/https; jetzt zusätzlich `{EAN}`-Pflicht
  → sofortiges Formular-Feedback statt erst Server-Fehler nach dem Speichern.
- **G11-3 — Sammel-Abruf-Transparenz.** `fetch-all` gab nur Zähler zurück; jetzt `skippedItems`/`failedItems`
  ({id,name,gtin,reason}); die Märkte-Seite zeigt aufklappbar, welche Artikel warum übersprungen wurden.

Preis-Modell (`product_prices`/`purchasePriceCt`) bewusst nicht angefasst. Gates: typecheck 0, lint 0/33, build ✓, vitest 98/98.
Manifest: neue Items G11-1a/b/c, G11-2, G11-3; G10-3 geschärft (Client-Guard).

### Commits
b4382ed (G11 — ProductForm, {EAN}-Guard, Sammel-Abruf-Transparenz)

---

## [Unreleased] — G10: Katalog-Modell als EAN-Spiegel des Bestands + 4 kaputte Punkte (implementiert, Test auf Pi ausstehend)

Die G9-Fixes griffen auf dem Pi nicht — die Diagnose war an der falschen Ebene angesetzt. Ehrliche
Ursachenanalyse (Workflow) + zwei Konzept-Rückfragen ergaben, dass das **Katalog-Datenmodell** falsch war,
nicht das Frontend. Umbau nach dem tatsächlich gewollten Konzept.

- **G10-1 (Kern, behebt G7-5 + G8-1):** Die Katalog-Sicherung zeigte Vorschläge nur bei einer *Änderung* der
  Globus-Daten und blieb deshalb dauerhaft leer (ein einmal `confirmed`/`rejected`-Snapshot kam nie wieder in
  `proposed`). Neu: **EAN-Spiegel des Bestands** — `listCatalogMirror` listet je Bestands-Artikel-mit-EAN den
  neuesten Katalog-Snapshot (Status egal) + einen berechneten Feld-Diff (`computeMirrorDiff`, Name/Bild/Kategorie;
  Preis bleibt beim F2-Flow). Immer sichtbar, ausklappbar, abweichende zuoberst; „Übernehmen" (angekreuzt) /
  „Alles übernehmen" / „Ignorieren". `applySnapshotToProduct` ist jetzt status-agnostisch und löst den Artikel per
  EAN auf (kein blinder 409 mehr).
- **G10-2 (behebt G8-4):** easy-add zeigt beim Bestand-Anlegen **nur existierende Artikel** (Name/Marke/EAN via
  `searchProducts` + neuem `eq(gtin, q)`). Der Globus-Katalog-Block, `selectCatalog` (materialize) und die
  On-demand-`catalog/search`-Anbindung sind entfernt — kein Anlegen-durch-Katalog, kein generisches Rauschen,
  kein toter Klick.
- **G10-3 (behebt G7-6):** Abruf-URL **ohne `{EAN}`-Platzhalter** wird jetzt schon beim Speichern abgelehnt (neuer
  Sentinel `MISSING_EAN_PLACEHOLDER` in `normalizeScrapeUrl`, in beiden Store-Endpunkten + der Märkte-Formaction).
  Die Struktur-/URL-Warnung nach dem Sync erscheint als dauerhafte, auffällige Warn-Card statt als flüchtiger Toast.
- **G10-4:** Einstellungs-Reihenfolge — „Einheiten" und „Aktivität" jetzt direkt unter „Märkte".
- **Folgeblock G11 (offen):** Vollkatalog-Suche in „Neuer Artikel" (alle gesehenen Snapshots + EAN-Lookup) +
  vereinheitlichte, vollständige Artikel-Bearbeitung.

Gates: typecheck 0, lint 0/33, build ✓, vitest 98/98 (+7 `mirror-diff`).

### Commits
832dcd7 (G10 — EAN-Spiegel, easy-add nur existierende, {EAN}-Pflicht beim Speichern, Sektions-Reihenfolge)

---

## [Unreleased] — G9: Katalog-Regressionen behoben (Vorschläge-Anzeige, Struktur-Check, Anlegen-Felder) (implementiert, Test auf Pi ausstehend)

Behebt drei in G8 eingebaute Katalog-Fehler.

- **G9-1 (Regression, kritisch):** Nach „Katalog jetzt sichern" wurden gar keine Vorschläge mehr angezeigt.
  `runCatalogSync`/`reviewSnapshot` überschrieben den lokalen State nach `invalidateAll()` mit **stale** `data`
  (Closure-Race — dieselbe G6-3-Lehre). Fix: `proposedSnapshots` ist jetzt `$derived(data.proposedSnapshots)` und
  aktualisiert sich reaktiv; keine manuelle Überschreibung mehr.
- **G9-2 Struktur-Check:** `structureWarning` konnte „0 Treffer wegen kaputter URL" nicht von „0 trotz gültiger Abfrage"
  trennen. Neuer `attempted`-Zähler → `structureWarning = attempted>0 && totalHits===0`; separater `noValidUrl`-Hinweis.
  `applyEanToUrl`/`applyQueryToUrl` liefern jetzt `null`, wenn die Vorlage keinen `{EAN}`-Platzhalter hat (malformed URL
  wird konsistent als „keine gültige URL" behandelt, nicht mehr blind gescraped).
- **G9-3 Katalog-Anlegen:** Ein aus dem Globus-Katalog angelegter Artikel bekam nur die EAN. Neu:
  `materializeSnapshotToProduct` legt den Artikel mit **Name + Bild + Kategorie** an (Kategorie best-effort per
  Namensabgleich) und verknüpft den Snapshot; easy-add ruft diesen Pfad (`action: 'materialize'`) statt eines nackten
  POST. Zusätzlich zeigt der „Ausgewählt"-Pill jetzt das Produktbild statt nur ein Emoji.

### Commits
6124363 (G9 — Vorschläge-Anzeige-Regression, Struktur-Check, Katalog-Anlegen mit Bild/Name/Kategorie)

---

## [Unreleased] — G8: Snapshot→Artikel + Markt-Merken + Update-Diagnose + On-demand-Katalog + Quick-Wins (implementiert, Test auf Pi ausstehend)

Folge-Rückmeldungen nach G7.

- **G8-1 Snapshot→Artikel:** „Übernehmen" schreibt die angekreuzten Katalog-Felder (Bild/Name/Kategorie) in den
  zugeordneten Artikel (`applySnapshotToProduct`, `updateProduct` um `imageUrl` erweitert). Bild vorausgewählt; leere
  Felder werden gefüllt, angekreuzte überschreiben; nur bei product_id, sonst 409. UI: Feld-Checkboxen je Vorschlag.
- **G8-2 Markt-Merken:** Einbuchen (POST /api/inventory) merkt den Herkunftsmarkt ergänzend als Bezugsquelle am Artikel
  (`addStoreForProduct`, product_stores, idempotent); `suggestStorePlaceForProduct` nutzt product_stores als Fallback-Hint.
- **G8-3 Update-Diagnose:** Update-Check zeigt die konkrete Ursache (kein Internet / GitHub-Rate-Limit / Build ohne SHA)
  statt pauschal „Prüfung nicht möglich".
- **G8-4 On-demand-Katalog-Suche:** Migration 0016 (pg_trgm + GIN-Index auf `globus_snapshots.name`, failsafe).
  `searchCatalogSnapshots` (lokaler Katalog) + `GET /api/catalog/search` (lokal + einmaliger Live-Suggest mit Klartext-
  Query via `applyQueryToUrl`, +Snapshots+Bilder). easy-add zeigt „Aus Globus-Katalog"-Treffer; Auswahl legt Artikel
  mit Name/EAN/Bild an. KEIN Massen-Crawl (Nährwerte weiter über OFF).
- **G8-5 Quick-Wins:** Einkauf umbenennen (Run-Detailseite); EAN auf /inventar-Übersicht; „Nur verfügbare"-Toggle wirkt
  (Loader lädt alle Status).

### Commits
G8-2/3 = 4364ea6 · G8-5 = dadc0f0 · G8-1 = f86cf01 · G8-4 = c806fc7

---

## [Unreleased] — G7: Globus-Katalog-Snapshots + Bilder + Backup + Gebinde-Einheit (implementiert, Test auf Pi ausstehend)

- **Gebinde-Einheit frei wählbar (G7-0):** der „1 Packung = …"-Selektor bot nur l/kg → jetzt Betrag + freie
  mass/volume-Einheit (g/kg/ml/l); intern weiter ml/g (`baseVal = val * toBaseFactor`). Anzeige heuristisch
  (`pickPackDisplayUnit`/`packToDisplay` in stock.ts, +5 Vitest). 40 g bleibt „40 g". Keine Migration.
- **globus_snapshots (Migration 0015):** append-only Roh-Landing-Zone für den Online-Katalog mit Historie + Approval
  (status proposed/confirmed/rejected, partieller proposed-Unique je EAN+Haushalt). Speichert das komplette
  Suggest-JSON (name, category[], priceCt, currency, Bild-URL, rawJson). product_id/store_id nullable.
- **Parser erweitert:** `parseGlobusSuggestJson` liefert jetzt category/currency/imageUrl/raw (Bild via EAN im
  Dateinamen, `extractImageUrlsByEan`); preislose Treffer bleiben erhalten (`priceCt` nullable). Umlaut-Entities
  dekodiert. `scrapeGlobusPrice` bleibt preis-strikt (Guard), neue `scrapeGlobusSnapshot(url,gtin)→{product,totalHits}`.
- **Bilder als Datei im Volume:** `lib/server/media` lädt Bilder failsafe (8s, Content-Type/Größe, atomar) unter
  `{household}/{gtin}.ext`; DB speichert nur den Pfad. Neues Docker-Volume `stoqr_media` (+ `MEDIA_DIR`, entrypoint-mkdir).
  Ausliefer-Route `/media/[...path]` (auth + household-scope + Traversal-Guard, `resolveMediaPath` +4 Vitest).
- **Query-Layer** `globus-snapshots.ts`: `recordSnapshot` (Diff via `snapshotDiffers` +6 Vitest; nur bei Änderung neuer
  Vorschlag, alter superseded), list/confirm/reject/counts.
- **Katalog-Sync** `POST /api/catalog/sync`: sequenziell + rate-limitiert über alle Artikel mit EAN + Markt-URL;
  Bild-Download + Snapshot; Aggregat `{proposedCreated, unchanged, skipped, failed, structureWarning}`.
  Struktur-Check warnt, wenn trotz EANs 0 Treffer (Globus-Format geändert). Review-Endpoint
  `POST /api/catalog/snapshots/[id]`.
- **Einstellungen-UI:** Section „Katalog-Sicherung (Globus)" mit Sync-Button + Review-Liste (Thumbnail,
  Übernehmen/Verwerfen).

Hinweis: Nährwerte/Allergene liefert der Suggest NICHT — der Snapshot ist die Roh-Landing-Zone (`rawJson`) für eine
spätere Ableitung.

### Commits
G7-0 (Gebinde-Einheit) = 2964b01 · G7 (Snapshots/Bilder/Backup) = 062658c

---

## [Unreleased] — G6-Politur: Reaktivität + Toggle-Feedback (implementiert, Test auf Pi ausstehend)

Feinschliff nach dem 73/73-Testlauf (drei Anmerkungen):

- **Reaktivität (G6-1/G6-3):** Standard-Einheit ändern bzw. „Alle angleichen" aktualisierte die Gebinde-/Einheiten-
  Anzeige erst nach Browser-Refresh. Ursache: `packDim`/`packVal` waren lokaler `$state`, der nach `invalidateAll()` nie
  neu aus `product` abgeleitet wurde. Fix: `$effect` synchronisiert beide bei `product`-Änderung (außer während aktiver
  Bearbeitung). Anzeige stimmt jetzt sofort.
- **Toggle-Feedback (F2-0):** Das „gespeichert" beim Online-Preis-Abruf-Schalter lag deplatziert in der Checkbox-Zeile;
  jetzt als eigene, dezente Bestätigungszeile unter dem Toggle (konsistent mit dem restlichen UI).
- **Doku:** stores.scrapeUrl-Kommentar auf die korrekte Suggest-URL (nicht mehr `search?query=`) angeglichen.

### Commits
1433cb3 (G6-Politur — Reaktivität, Toggle-Feedback, Doku)

---

## [Unreleased] — G6: Einheiten-Fixes (Preis-Einheit, editierbare Standard-Einheit, Angleichung) (implementiert, Test auf Pi ausstehend)

Behebt den „falsche Einheit im Preisvorschlag" (blihn statt Packung) und macht die eingefrorene Standard-Einheit wieder pflegbar.

- **Preis-Vorschlags-Einheit** kommt jetzt aus der **häufigsten verwendeten Bestands-Einheit** (nur `available`) →
  Fallback `defaultUnit` → `piece`. `suggestStockUnitForProduct` (products.ts, `mostFrequent` auf Modul-Ebene gezogen).
  Fetch + Fetch-all nutzen sie. Behebt „blihn"-Vorschlag bei Artikeln, deren defaultUnit alt/falsch ist.
- **Standard-Einheit editierbar:** Auf der Artikel-Detailseite ein „Standard-Einheit"-Selektor (PATCH /api/products/[id]
  {defaultUnit}). Ursache des Bugs: kein Formular konnte defaultUnit ändern und die easy-add-Automatik greift nur bei
  leerem/`piece`-Default → einmal „blihn", für immer „blihn". Jetzt manuell änderbar.
- **Quick-Win „Alle angleichen":** `POST /api/products/[id]/normalize-unit {unit, mode}` setzt defaultUnit + ALLE
  Bestände (jeder Status: available/consumed/donated/discarded/expired) auf eine Einheit. Modus **relabel** (nur Label)
  oder **convert** (Menge via toBaseFactor umrechnen, wo mass/volume-Dimension passt; sonst relabel). Dialog erklärt
  beide Optionen mit konkreten Beispielen (500 g→0,5 kg / 2 Packung→2 Stück). Audit.

### Commits
317fd91 (G6 — Preis-Einheit, editierbare Standard-Einheit, Angleichung)

---

## [Unreleased] — G5: Globus-Scraper korrekt gebaut (Suggest-Endpunkt + JSON) (implementiert, Test auf Pi ausstehend)

Der bisherige Scraper funktionierte nie: er lud die Globus-`/search`-Seite (rendert Produkte erst per JS → leeres HTML)
und nutzte einen geratenen, nicht existierenden Selektor. **Am echten HTML verifiziert** und neu gebaut:

- **Datenquelle = Suggest-Endpunkt** `/{filiale}/suggest?search={EAN}` — liefert serverseitig (ohne JS) je Treffer ein
  JSON `data-etracker-search-suggest-product='{"id":"<EAN>","name":…,"price":"0.29","currency":"EUR"}'`. Verifiziert
  mit EAN 4306188415978 → „Mineralwasser, Classic", 0,29 €.
- **Neuer Parser** `parseGlobusSuggestJson` (JSON statt HTML-Raten) + `matchSuggestByEan` (exakter EAN-Match, sonst null)
  + `parsePriceToCents` („0.29"→29). 14 Vitest gegen echtes Fixture-Snippet.
- **scrapeGlobusPrice(url, gtin)** holt die Suggest-URL (X-Requested-With, Browser-UA), matcht exakt auf `products.gtin`.
  Kein Treffer / Artikel nicht im Sortiment → sauber „Kein Onlinepreis gefunden" (kein Crash). Failsafe unverändert.
- **URL-Feld-Anleitung** korrigiert auf die Suggest-URL (`…/suggest?search={EAN}`).
- **Toggle-Erfolgs-Feedback** entschlackt: kompaktes „✓ gespeichert" neben dem Schalter statt fehlplatziertem Alert-Banner.

Wichtige Erkenntnis: EAN 4104420060821 (mein Test) fand nichts, weil Globus Hockenheim den Artikel nicht führt — kein
Bug. Reale EANs (4306188415978, 5449000017987) liefern korrekt Preise.

### Commits
f0b5af6 (G5 — Suggest-Parser, Scrape-Wrapper, URL-Anleitung, Toggle-Feedback)

---

## [Unreleased] — G4: In-App-Schalter + {EAN}-URL + Bugfixes + Dark-Mode-Icons (implementiert, Test auf Pi ausstehend)

Korrektur der G2-Fehlinterpretation (Filiale/Region war falsch) + Testfeedback-Fixes.

- **In-App-Schalter statt Env-Variable:** `expiry_config.price_scrape_enabled` (Migration 0014); Toggle in
  Einstellungen → „Online-Preis-Abruf". `isPriceScrapeEnabled()` ist jetzt `async(householdId)` und liest die DB.
  `PRICE_SCRAPE_ENABLED` (Env) + docker-compose-Eintrag entfernt. Kein Server-/Deploy-Eingriff mehr nötig.
- **Filiale/Region rückgebaut:** `stores.scrape_region` (0013) wieder entfernt (0014 DROP COLUMN). Kein Region-Feld/
  Pflicht mehr. Markt-Pflicht bleibt Name + Adresse + Stadt (Kette optional).
- **Abruf-URL mit `{EAN}`-Platzhalter:** die Markt-URL trägt `{EAN}` (z.B.
  `https://produkte.globus.de/hockenheim/search?query={EAN}`), stoqr ersetzt es durch `products.gtin`
  (`applyEanToUrl`, +7 Vitest; `buildGlobusSearchUrl` entfernt). URL-Feld hat jetzt eine **Anleitung mit Muster**.
- **URL-Validierungs-Bug gefixt:** „abc" wurde nach Wechsel gültig→ungültig fälschlich akzeptiert (Client-State ließ
  den abgelehnten Wert stehen). Client-seitige URL-Prüfung (`isValidHttpUrl`) + Server-Store als Wahrheit übernommen.
- **Adress-Autocomplete angeglichen:** volle `.input`-Optik in der Komponente (scoped-styles-Problem), Adress-Icon,
  `onpointerdown` gegen Blur-Race (Auswahl ging verloren).
- **Dark-Mode-Icons sichtbar:** globales `color-scheme: dark` + invert für `::-webkit-calendar-picker-indicator`
  (MHD-Kalender, number/time/select) in `app.css`.

### Commits
714b4cd (G4 — Datenmodell, In-App-Schalter, {EAN}-URL, Bugfixes, Dark-Mode als ein Block)

---

## [Unreleased] — G1/G2: Reaktivität + Bestand-Kaufpreis + Markt-Pflichtfelder/OSM + Globus-Barcode-Search (implementiert, Test auf Pi ausstehend)

Folge-Themen nach F2-Test. **G1** (Fixes, eigener Commit 8348d0b): siehe unten. **G2** (dieser Block): Markt-Daten werden
Pflicht, Adress-Autocomplete via OpenStreetMap, und der Globus-Abruf nutzt jetzt die echte Barcode-Search-URL.

**G2 — Markt-Pflichtfelder + OSM-Autocomplete + Barcode-Search:**
- **Migration 0013_stores_scrape_region** (additiv): `stores.scrape_region varchar(64)`. `scrape_url` (F2) bleibt als Override.
- **Pflichtfelder** beim Anlegen/Bearbeiten eines Markts: Name + Adresse + Stadt + Filiale/Region; **Kette optional**.
  Nur in Actions/API erzwungen (kein DB-NOT-NULL) → bestehende Märkte bleiben ladbar (sanfte Migration).
- **OSM/Nominatim-Autocomplete:** Server-Proxy `GET /api/geo/search` (User-Agent-Pflicht, 1 req/s-Guard, Timeout, Fehler→[]),
  reine `mapNominatimResult` in `lib/utils/geo.ts` (+6 Vitest), Komponente `AddressAutocomplete.svelte` (Debounce 500ms).
  Adress-Auswahl füllt Stadt + Koordinaten (lat/lon existierten schon als numeric).
- **Barcode-Search-URL:** reine `buildGlobusSearchUrl(region, gtin)` (+6 Vitest) → `https://produkte.globus.de/{region}/search?query={gtin}`.
  Zentrale `resolveScrapeUrl(store, gtin)`: `scrapeUrl`-Override gewinnt, sonst `scrapeRegion + products.gtin`, sonst skip.
  Einzel-Abruf (`prices/fetch`) und Sammel-Abruf (`stores/[id]/prices/fetch-all`) nutzen sie; Artikel ohne EAN → `skipped`.
  Failsafe wie F2 (8s Timeout, jeder Fehler → null, Miss=200).

**G1 (Commit 8348d0b) — Reaktivität + Bestand-Kaufpreis + Konzept-Doku:**
- invalidateAll() in saveRow/consumeRow/setRowStatus/deleteRow (Gesamtbestand sofort aktuell).
- `inventory_items.purchasePriceCt` auf der Detailseite nachträglich editierbar (Backend unterstützte es bereits).
- ROADMAP-Abschnitt „Artikel- vs. Bestands-Ebene" (Priorisierung/Vererbung).

### Commits
G2 = d756d54 · G1 = 8348d0b

---

## [Unreleased] — F2: Online-Preis-Abruf (Globus) + Staging/Freigabe (implementiert, Test auf Pi ausstehend)

Opt-in DOM-Scraping von Marktpreisen. Abgerufene Preise landen **nie** direkt maßgeblich, sondern als **Vorschlag**
(Staging); der User übernimmt, korrigiert oder verwirft. Failsafe „in jeder Hinsicht": Env-Toggle default AUS,
8s-Timeout, jeder Fehler → `null`, kein 5xx bei Scrape-Miss, kein Auto-Confirm.

- **Migration 0012_price_staging** (additiv/idempotent): `product_prices.status` (`proposed`/`confirmed`/`rejected`,
  DEFAULT `confirmed` → Bestandszeilen gebackfillt); partieller Unique-Index `product_prices_proposed_uniq`
  (max. 1 offener Vorschlag je Artikel+Markt+Haushalt); `stores.scrape_url` (nullable).
- **Kern-Invariante** `status != 'confirmed' ⇒ isCurrent = false` (hart im Code) → Vorschläge fließen nie ins Estimate;
  alle `isCurrent`-Getter bleiben unberührt.
- **Parser** `lib/utils/globus-price.ts` (rein, `node-html-parser`, Selektor-Konstante `div.unit-price .discount-price`,
  `parseEuroToCents` komma/punkt-tolerant) + 14 Vitest-Fälle. **Scrape-Wrapper** `lib/server/scrape/globus.ts`
  (AbortController 8s, UA + `Accept-Language`, try/catch → null, `isPriceScrapeEnabled`, `normalizeScrapeUrl`).
- **Query-Layer** `prices.ts`: `recordProposedPrice` (superseded alte offene Vorschläge), `listProposedForProduct`,
  `getProposedForProducts`, `confirmProposedPrice` (in-place → confirmed, recordPrice-Semantik), `rejectProposedPrice`;
  `status:'confirmed'` explizit in `recordPrice`.
- **API:** `POST /api/products/[id]/prices/fetch` (Einzel, Env-Guard, Miss=200 `{proposed:null}`),
  `POST /api/products/[id]/prices/proposals/[proposalId]` (confirm/reject, nicht geguarded),
  `POST /api/stores/[id]/prices/fetch-all` (sequenziell + Rate-Limit, Aggregat, immer 200; Gerüst — ohne
  artikelspezifische URL werden Artikel `skipped`). Store-`scrapeUrl` in PATCH/POST `/api/stores` + Märkte-Form.
- **UI:** Preise-Card (inventar/[id]) zeigt Online-Vorschlag mit **Übernehmen/Korrigieren/Verwerfen** + „Online abrufen"
  je Markt (nur bei `scrapeUrl` + Feature an). Einstellungen→Märkte: Abruf-URL-Feld + „Preise abrufen"-Sammel-Button +
  „Online-Abruf aktiv"-Badge. Audit-Label `scrapeUrl`; Env `PRICE_SCRAPE_ENABLED` in `.env.example` + docker-compose.

### Commits
dbd097a (F2 — Datenmodell, Parser, Query-Layer, Scraper, API, UI, Doku als ein Block)

---

## [Unreleased] — Einheiten-System v2: Gebinde-Größe je Artikel (auf Pi getestet ✓ 2026-07-18)

Zwei Einheiten-Themen: (a) Einheiten untereinander umrechenbar; (b) „Flasche" kann verschiedene Größen haben.
Kern-Erkenntnis: mass/volume waren via `toBaseFactor` schon umrechenbar — das echte „nicht vergleichbar" ist ein
Artikel-Problem („Flasche = welche Größe?"). Daher: (a) = UI-Klarstellung, (b) = Gebinde-Größe je Artikel.

- **KEINE Migration nötig** — `products.defaultVolumeMl`/`defaultWeightG`/`defaultQuantity` existieren seit Migration 0000.
- **stock.ts:** neue Primitive `PackSize`, `resolveUnitMeta(unit, metaMap, packSize?)`, `buildPackSize(product)`.
  `aggregateStock`/`compareToTarget`/`planInventoryAdjustment` nehmen optionalen `packSize` — eine count-Einheit („Flasche")
  wird auf Volumen/Masse überführt; FIFO rechnet korrekt in Gebinde-Einheit zurück. `StockGroup.packCount` für Dual-Anzeige.
  Fallback ohne Gebinde = exakt heutiges Verhalten. (G2/G3)
- **prices.ts:** `estimateLineCost` mit `packSize` (need+price) → „Preis pro Flasche" gegen Bedarf in l vergleichbar. (G4)
- **Artikel-Felder editierbar:** `updateProduct` + PATCH `/api/products/[id]` nehmen `packDimension`/`packSize` (genau eine
  Dimension; l/kg-Eingabe → ml/g gespeichert). (G5)
- **Verdrahtung:** getProductStockTotals, inventar/[id]-Loader, inventory-adjust, generateAutoNeeds, einkauf/[id] +
  einkaufsliste (Estimate) reichen packSize durch. (G6/G7)
- **UI:** Gebinde-Zeile auf der Artikel-Detailseite („1 Flasche = 1,5 l", nur bei count-defaultUnit); Gesamtbestand-
  Dual-Anzeige „3 Flasche (4,5 l)". Einstellungen→Einheiten: count zeigt „Größe je Artikel (Gebinde)". (G8/G9)
- 18 neue Vitest-Fälle (buildPackSize/resolveUnitMeta/Gebinde-Aggregation/-Vergleich/-FIFO/-Preis), 50 Tests gesamt grün.

### Commits
d7b1adb (G1+G2) · 9e20c52 (G3) · 4e2906c (G4) · 9fa1096 (G5) · 5ca1bbc (G6) · 8228dbc (G7) · 0960a5d (G8) · 4d92f88 (G9)

### Test-Steps (Pi)
1. Artikel „Sprudel", defaultUnit „Flasche" → Detailseite → Gebinde „1,5 l" festlegen.
2. 3 Flaschen als Bestand → Gesamtbestand „3 Flasche (4,5 l)".
3. Soll „6 l" → Bedarf-Indikator vergleicht (nicht mehr „nicht vergleichbar"); Fehlmenge stimmig.
4. Preis „0,29 € pro Flasche" → Estimate rechnet gegen Bedarf in l fair.
5. Fallback: Artikel ohne Gebinde verhält sich wie bisher.
6. Einstellungen→Einheiten: count-Einheit zeigt „Größe je Artikel (Gebinde)".

---

## [Unreleased] — Block F auf Pi getestet ✓ + Roadmap fortgeschrieben (2026-07-18)

- **P1-Fix** (050fad3): Preisfeld (easy-add + Detailseite) war `type="number"` an String-State gebunden → Svelte-5-Zahl-Coerce
  ließ `.trim()`/`.replace()` crashen. Auf `type="text" inputmode="decimal"` umgestellt + defensive `String(...)`.
- **Block F vollständig auf dem Pi getestet** (Test-Manifest komplett grün, keine Auffälligkeiten). E4/K1 aus der vorigen
  Runde waren reines Deploy-Lag (Code war korrekt) — nach Deployment des aktuellen Images ebenfalls unauffällig.
- **Roadmap fortgeschrieben:** F2 (Online-Preis-Abruf **mit Staging/Freigabe**) als nächster Block bestätigt; neue geplante
  Features aufgenommen: Pfand/Leergut (volles Handling), Einkäufe umbenennen, Inventar „Artikel"-Toggle, „Verbraucht"-Handling +
  Wiederherstellen (inkl. wirkungsloser „Nur verfügbare"-Toggle-Fix), günstigster-Preis-Hinweis, Einheiten-Umrechnung
  „Flasche 1,5 l" via Gebinde-Größe je Artikel.

---

## [Unreleased] — Block F: Preise je Artikel+Markt mit Historie (implementiert, auf Pi getestet ✓ 2026-07-18)

Preis-Dimension ergänzt: Preise je (Artikel, Markt) mit Historie, Kosten-Schätzung in Einkaufsliste + Einkauf-Run.
Online-Abruf (Globus/Penny) bewusst ausgeklammert — eigener Block F2. Additiv.

### Datenmodell + Fundament (F-1, F-2)
- `product_prices` (Historie): priceCt pro Einheit, isReduced, isCurrent, source manual|booked|online, recordedAt.
  Migration 0011 (partieller Unique-Index `product_prices_current_uniq` = max 1 isCurrent je Artikel+Markt). `_journal` idx 11.
- `queries/prices.ts`: recordPrice (transaktionale isCurrent-Umschaltung), getCurrentPrice(sForProducts/AllStores/ListProducts), listPriceHistory.
- `lib/utils/prices.ts` (rein, 12 Vitest-Fälle): estimateLineCost (toBaseFactor mass/volume, count Symbol-Match), summarizeCosts, formatEuroApprox.

### Kaufpreis erfassen (F-3, F-4)
- **Einbuchen (easy-add):** formularweites Preisfeld (pro Einheit) + Haken „reduziert"/„als Dauerpreis"; schreibt
  `inventory_items.purchasePriceCt` an jeder Charge + einen Preis-Historieneintrag (source=booked, nur erste Charge).
- **Separate Pflege:** „Preise"-Card auf der Artikel-Detailseite je zugeordnetem Markt (aktueller Preis, Angebot-Badge,
  Inline-Editor); neue Route `/api/products/[id]/prices` (GET current/history, POST manual).
- **Reduziert/Dauerpreis:** ein reduzierter Preis wird nur maßgeblich (isCurrent), wenn ausdrücklich als Dauerpreis übernommen.

### Estimate-Anzeige (F-5, F-6, F-7)
- **Einkauf-Run:** server-seitig via trip.storeId — „ca. ~X €" pro Position + Kopf-Summe + Warnung bei fehlenden Preisen.
- **Einkaufsliste:** client-reaktiv via selectedStore — Estimate pro Position + Summe + Warnung; ohne Markt „Markt wählen".
- **Einheiten:** 1,50 €/kg bei 500 g Bedarf → 0,75 €; inkompatible Einheit → „Einheit ≠".
- Aktivitäts-Labels für product_prices.

### Commits
9bf1950 (F-1) · 6c5b0bd (F-2) · bbea93d (F-3) · 1351586 (F-4) · 8fbba90 (F-5) · 19579b0 (F-6) · 828c174 (F-7)

### Test-Steps (Pi)
1. Container-Neustart → Migration 0011 (`product_prices`, Unique-Index).
2. Bestand einbuchen mit Preis 1,19 €/Packung → Preis am Bestand + Preis-Eintrag; Detailseite-„Preise"-Card zeigt ihn.
3. Reduziert ohne Dauerpreis → Estimate nutzt weiter den regulären Preis; mit „als Dauerpreis" → neuer maßgeblicher Preis.
4. Detailseite: Preis je Markt manuell setzen.
5. Einkauf-Run (Markt gesetzt) → Positionen „ca. ~X €" + Summe; Artikel ohne Preis → Warnung.
6. Einkaufsliste, Markt „Globus" → Estimate + Summe; ohne Markt → „Markt wählen".
7. Preis 1,50 €/kg, Bedarf 500 g → 0,75 €; Preis/Packung vs. Bedarf in kg → „Einheit ≠".

### Ausblick: Block F2 (Online-Preis-Abruf Globus/Penny, opt-in, DOM-Scraping) — separater Block.

---

## [Unreleased] — Block-E-Testing-Feedback: 2×2-Wurzelfix, leere Runs, Spenden/Entsorgen (implementiert, Test auf Pi ausstehend)

Testlauf des Manifests A–E deckte drei Punkte auf:

- **E2 (2×2 an der Wurzel):** `generateAutoNeeds` erzeugte weiterhin pro zugeordnetem Markt einen Bedarf
  (2×Globus + 2×Penny). Fix: **ein Bedarf pro Artikel** (nach productId gruppiert, `preferredStoreId` immer null,
  markt-neutral) — rein aus Soll-Ist. Der Markt wird erst beim Zuweisen zu einem Run gewählt. Bestehende
  markt-duplizierte auto-Einträge desselben Artikels werden beim nächsten „Bedarf erzeugen" auf einen zusammengeführt. (ec082da)
- **E4 (leere Runs):** `createTrip` verwendet einen vorhandenen leeren nicht-beendeten Run desselben Markts wieder;
  die Einkauf-Übersicht blendet Runs ohne Positionen aus (mit dezentem Hinweis, wie viele). `listTrips` liefert `itemCount`. (f762ae3)
- **K1 (Spenden/Entsorgen):** Status `donated`/`discarded` waren nur Anzeige-Labels ohne setzende UI. Neue Aktionen
  „Gespendet"/„Entsorgt" im Inventar-3-Punkt-Menü + Artikel-Detailseite (analog „Verbraucht"). Label vereinheitlicht:
  `donated` heißt jetzt überall „Gespendet". (25808aa)

### Test-Steps (Pi)
1. Vollmilch bei Globus+Penny zugeordnet, Soll 4 > Ist → „Bedarf erzeugen": es entsteht nur EIN Vollmilch-Bedarf (nicht 2×2).
2. „In Einkauf" beim Vollmilch-Bedarf → in der Liste reserviert; kein zweiter Bedarf mehr vorhanden.
3. Zweimal „Neuen Einkauf starten" für denselben Markt ohne Position → nur ein (leerer) Run; Übersicht zeigt keine leeren Runs.
4. Bestand im 3-Punkt-Menü „Gespendet"/„Entsorgt" → Status-Badge erscheint, Gesamtbestand sinkt; Label überall „Gespendet".

---

## [Unreleased] — Block E: Einkauf-Entität (M2) — behebt 2×2-Bedarf (implementiert, Test auf Pi ausstehend)

M1 erzeugte Bedarf pro zugeordnetem Markt → Milch bei Globus+Penny gelistet und 2× gebraucht = 2×2. Block E
führt eine **Einkauf-Entität** ein: ein Bedarf wird genau EINEM Run zugewiesen (reserviert), kann also nicht
doppelt eingekauft werden. Additiv, keine bestehende Logik zurückgebaut.

### Datenmodell + Migration (E1)
- `shopping_trips` (Run: Status begonnen|pausiert|beendet, storeId, name, dates) + `shopping_trip_items`
  (Position: reserviert 1 Bedarf via `shoppingListItemId` UNIQUE + FK cascade; realStatus offen|gekauft|ausverkauft;
  denormalisierte product/quantity/unit).
- Migration 0010 (additiv): partieller Unique-Index `shopping_trips_active_uniq` (max 1 'begonnen' je Haushalt) +
  `shopping_trip_items_need_uniq` (1 Bedarf = 1 Run). `_journal.json` idx 10.

### Backend (E2–E4)
- `queries/shopping-trips.ts`: create/list/get/update/delete + pause/resume/end (transaktional; endTrip blockiert
  bei nicht eingebuchten 'gekauft'-Positionen, löst sonst offene/ausverkaufte); reserveNeed/reserveAllForStore/
  moveTripItem/updateTripItem/releaseTripItem/bookInTripItem.
- APIs `/api/shopping-trips` (+ `[id]`, `[id]/items`, `[id]/items/[itemId]`, `.../book-in`); writeAudit je Mutation.
- `generateAutoNeeds`: reservierte Bedarfe geschützt (nie überschrieben/gelöscht/dupliziert). `getShoppingList`
  liefert `reservedTrip*`. `deleteShoppingItem`: 409 wenn reserviert.

### UI (E5–E8)
- Einkaufsliste: reservierte Bedarfe „sichtbar aber gesperrt" (ausgegraut, Badge, „→ verschieben"-Dropdown);
  „In Einkauf" pro Bedarf + Sammel-Aktion „Alle in Einkauf legen"; „Direkt einbuchen" als Fallback.
- Neue Seite `/einkauf` (Übersicht: neuer Run, laufende/beendete Runs, Fortsetzen) + `/einkauf/[id]` (Positionen mit
  Gekauft/Ausverkauft-Chips, Einbuchen, Freigeben; Pausieren/Fortsetzen/Beenden/Löschen). Nav-Link „Einkauf".
- easy-add: Split-Chips (×2/×3/×4) teilen die Menge auf N MHD-Zeilen; Einbuchen aus Run (`fromTripItem`+`tripId`)
  → book-in + Redirect zum Run.
- Aktivitäts-Labels für shopping_trips / shopping_trip_items.

### Commits
9a05157 (E1) · d6b6f10 (E2) · cc95666 (E3) · 4775eda (E4) · 9482a9e (E6) · d327598 (E5) · 01bc69e (E7) · 47a1ce9 (E8)

### Test-Steps (Pi)
1. Container-Neustart → Migration 0010 (shopping_trips*, beide Unique-Indizes).
2. Milch bei Globus+Penny, 2× Soll → „Bedarf erzeugen"; einen dem Globus-Run zuweisen → in Penny-Ansicht ausgegraut
   „reserviert · Globus-Run" (kein 2×2).
3. Zweiten Run starten → erster pausiert. Beenden blockiert bei nicht eingebuchter „gekauft"-Position.
4. Reservierten Bedarf per Dropdown in anderen Run verschieben.
5. Position „ausverkauft" → beim Run-Beenden zurück in den Backlog.
6. Position einbuchen → „Split 2" → 2 Bestände mit je MHD; Bedarf + Position weg; Redirect zum Run.
7. Sammel-Aktion „Alle in Einkauf legen" reserviert alle passenden offenen Bedarfe.
8. /aktivitaet zeigt Einkauf-/Einkauf-Position-Einträge.

### Ausblick: Block F (Preise) — product_prices + Historie, Estimate „ca. ~X €", Kaufpreis-Korrektur, Online-Abruf.

---

## [Unreleased] — M1-Feedback Nachbesserung: A6 + B behoben (implementiert, Test auf Pi ausstehend)

Zweite Testrunde deckte auf, dass A6 und B nicht vollständig erfüllt waren. Ursachenanalyse via
Diagnose-Workflow (4 parallele Leser), dann gezielte Fixes.

### A6 — Einheit-Vorauswahl (war: „Blihn" statt „Packung")
- **Primär:** `products.defaultUnit` wurde beim Artikel-Anlegen nie gesetzt (FAB-Dialog sendete nur name+categoryId)
  → Standard-Einheit-Selektor in FAB-Dialog ergänzt; `defaultUnit` wird nun gespeichert. Zusätzlich zieht easy-add
  beim ersten Bestand `defaultUnit` nach, falls der Artikel noch auf `piece` steht. (4789229, 08cf639)
- **Sekundär:** Custom-Einheiten wurden mit `sortOrder=0` vor die System-Einheiten sortiert → als Fallback
  vorbelegt. Fix: Custom-Einheiten `sortOrder=100`; easy-add-Fallback wählt gezielt `piece`. (08cf639)

### B — EAN am Artikel
- **B-b/B-a:** `getProductById` selektierte `gtin` nicht → EAN-Änderung erst nach Reload sichtbar, Konflikt-Meldung
  wirkte unklar. Fix: `gtin` in columns-Allowlist. (99bed3b)
- **B-c:** FAB-„Neuer Artikel"-Dialog hatte kein EAN-Feld → EAN dort nicht erfassbar. Fix: EAN-Feld ergänzt;
  Fehlerbehandlung zeigt jetzt die Server-Meldung (z.B. EAN-Konflikt 409). (4789229)

### Commits
99bed3b (B-b getProductById.gtin) · 08cf639 (A6 Einheiten-Sortierung + Fallback + defaultUnit-Nachzug) ·
4789229 (B-c + A6-primär: EAN + Einheit im FAB-Dialog)

### Test-Steps (Pi)
1. **A6:** FAB „Neuer Artikel" → Name + Einheit „Packung" wählen → anlegen. „Bestand hinzufügen" für diesen
   Artikel → Einheit „Packung" ist vorbelegt (nicht mehr eine Custom-Einheit).
2. **B-c:** FAB „Neuer Artikel" hat jetzt ein EAN-Feld; EAN eingeben → in Einstellungen→Artikel sichtbar.
3. **B-b:** EAN eines Artikels bearbeiten → sofort in der Liste sichtbar (kein Reload nötig).
4. **B-a:** Zweiten Artikel mit gleicher EAN anlegen → klare Meldung „Diese EAN ist bereits einem anderen Artikel zugeordnet."

---

## [Unreleased] — M1-Feedback: Fixes, EAN am Artikel, Vererbung, Audit-Log (implementiert, Test auf Pi ausstehend)

Testing von M1 deckte einen Bug, mehrere Konsistenz-Lücken und einen Architektur-Fehler auf.
Blöcke A–D abgearbeitet (risikoarm/additiv). Block E (Einkauf-Entität M2, behebt das 2×2-Milch-Problem)
und F (Preise) folgen mit eigener Feinplanung.

### Block A — Fixes & Konsistenz
- **A1 Bugfix Soll-Bestand „Netzwerkfehler":** `stockTarget`/`targetStatus` von `$state` auf `$derived(data.…)`
  umgestellt, manuelle Zuweisungen entfernt, `catch` loggt jetzt den echten Fehler. Trat nur mit gesetztem
  Mindestbestand auf. (77b3e6e)
- **A2 0,25er-Stepper:** alle Mengenfelder `step="0.25"` (Faktor/Nährwerte unverändert); freie Eingabe bleibt. (97a3462)
- **A3 „Orte" → „Räume":** UI-Texte umbenannt (Nav, Dashboard, /orte, Filter, easy-add); Route/interne Namen bleiben. (40798b6)
- **A4 Einheiten-Vorschläge:** SUGGESTIONS 12 → 28 (dl, Tasse, Schuss, Tropfen, Msp, Portion, Scheibe, Riegel,
  Tafel, Tube, Kanister, Sack, Karton, Netz, Kiste, Bündel, Paar); „+ Vorschläge"-Button verschwindet, wenn alle vorhanden. (4d3a374)
- **A5 MHD-fehlt hervorheben:** „Kein MHD" nicht mehr grün, sondern eigene auffällige `.mhd-none`-Klasse (Übersicht + Detail). (832dfee)
- **A6 Einheit-Vorauswahl merken:** easy-add übernimmt die `defaultUnit` des gewählten Artikels (solange nicht manuell
  geändert); Detailseite belegte bereits korrekt vor. (9000b61)

### Block B — EAN/Barcode am Artikel (primär)
- `products.gtin` im UI pflegbar (Anlegen/Ansicht/Bearbeiten in /einstellungen/artikel); `updateProduct` + POST/PATCH
  reichen gtin durch; Unique-Konflikt (23505) → 409 „EAN bereits einem anderen Artikel zugeordnet". (cc1674f)

### Block C — Markt/Ort-Vererbung bei neuem Bestand
- easy-add belegt beim Artikel-Wählen häufigsten Lagerort + Markt vorhandener Bestände desselben Artikels vor
  (nur leere Felder). `suggestStorePlaceForProduct()` + neue Route `/api/products/[id]/inventory-hints`. (c094739)

### Block D — Vollständiges Audit-Log + Aktivitäts-Seite
- `audit_log.household_id` ergänzt (Migration 0009, additiv/idempotent) + Index.
- Helper `writeAudit()` (best-effort) + `diffFields()` + `listAuditLog()` in `queries/audit.ts`.
- Eingehängt in ALLE Schreib-Routen: products, inventory_items (inkl. consume/inventory-adjust), stock_targets,
  units, stores, locations/storages/places (jeweils INSERT/UPDATE/DELETE, Vorher/Nachher).
- Neue Seite `/aktivitaet` (chronologisch nach Tag, Aktion-Badge, Vorher→Nachher-Diff, dt. Labels), verlinkt aus /einstellungen. (82ce904)

### Commits
77b3e6e (A1) · 97a3462 (A2) · 40798b6 (A3) · 4d3a374 (A4) · 832dfee (A5) · 9000b61 (A6) ·
cc1674f (B) · c094739 (C) · 82ce904 (D)

### Test-Steps (Pi)
1. **Migration:** Container-Neustart → `audit_log.household_id` vorhanden (Migration 0009 lief).
2. **A1:** Soll-Bestand mit Mindestbestand speichern → kein „Netzwerkfehler", Wert bleibt.
3. **A2:** Mengen-Stepper springt in 0,25; Tastatur erlaubt frei „1,3".
4. **A3:** Menü/Seiten zeigen „Räume".
5. **A4:** Einheiten-Vorschläge zeigen neue Einträge; Button weg, wenn alle angelegt.
6. **A5:** Bestand ohne MHD ist orange/gestrichelt markiert (nicht grün).
7. **A6:** Artikel mit `defaultUnit` = „Packung" in easy-add wählen → Einheit vorbelegt.
8. **B:** Artikel mit EAN anlegen; EAN in Liste sichtbar; bearbeiten; zweite gleiche EAN → Fehlermeldung.
9. **C:** Zweiten Bestand desselben Artikels anlegen → Markt/Ort aus erstem Bestand vorbelegt.
10. **D:** Beliebige Änderung (Artikel umbenennen, Bestand buchen, Soll ändern) → /aktivitaet zeigt Eintrag mit Vorher→Nachher, User, Zeit.

---

## [Unreleased] — Inkrement M1: markt-gesteuerter Einkauf (implementiert, Test auf Pi ausstehend)

**Architektur-Klärung:** Markt liegt jetzt auf zwei Ebenen — am **Artikel** (Planung: „wo einkaufbar",
M:N via product_stores) UND am **Bestand** (Ist-Herkunft: inventory_items.storeId, unverändert). Kein
Rückbau bestehender Logik; rein additiv.

### Markt am Artikel (M:N)
- `product_stores` neu (schlank: productId↔storeId↔household, Migration 0008). Bewusste Wiedereinführung
  der in Inkr.1 entfernten Tabelle in klarer Rolle „hier planbar erhältlich" (kein Preis/sort_order).
- Query-Layer `product-stores.ts`, API `/api/products/[id]/stores` (GET/PUT).
- Artikel-Detailseite: „Märkte"-Card mit Markt-Chips (Mehrfachauswahl).

### Markt-gesteuerte Einkaufsliste
- `generateAutoNeeds`: Markt aus product_stores — pro zugeordnetem Markt ein auto-Eintrag
  (Dedup jetzt (productId, storeId)); Artikel ohne Zuordnung → „egal". Verwaiste Einträge werden bereinigt.
- Einkaufsliste: Markt-Auswahl „Einkauf bei" (ein Markt) → zeigt dessen Bedarf + markt-lose Einträge; kein Mischen.
- Einbuchen belegt den aktiven Listen-Markt im Bestandsformular vor (storeId-Param an easy-add).

### Commits
903350c (product_stores Schema+Migration) · 6706fa4 (Query-Layer) · 4f7db1a (API+Markt-Chips) ·
46a59e4 (Bedarf-Markt) · 27c5bff (Markt-Filter Einkaufsliste) · 6744f65 (Einbuchen-Vorbelegung)

### Ausblick (geplant): M2 Einkauf-Status-Entität, M3 Preise+Estimate, M4 Rezepte+Personen (siehe ROADMAP)

### Test-Steps (Pi)
1. Artikel-Detailseite → Märkte „Globus" + „Penny" zuordnen.
2. „Bedarf erzeugen" → auto-Einträge je Markt; Einkaufsliste Markt=Globus zeigt nur Globus + markt-lose.
3. „Einbuchen" bei Globus → easy-add hat Markt Globus vorbelegt.

---

## [Unreleased] — Inkrement 2c: Einkaufsliste + Bestandskorrektur (implementiert, Test auf Pi ausstehend)

Schließt den Kreislauf **Inventur → Bedarf → Einkaufsliste → Einbuchen** — Basis für (Semi-)Automatisierung.

### Bestandskorrektur / Inventur
- Artikel-Detailseite: „Bestand korrigieren" — tatsächlichen Gesamtbestand angeben; Differenz wird
  **FIFO** (älteste MHD zuerst) auf die Bestände zurückgeschrieben. Erhöhung nur per „Bestand hinzufügen".
- `planInventoryAdjustment` in stock.ts (+ Tests). API `/api/products/[id]/inventory-adjust`.

### Einkaufsliste
- Route ersetzt Platzhalter: **auto-Bedarf** (Soll−Ist, auffüllen bis Soll) + **manuelle Freitext-Einträge**,
  abhaken, löschen. Button „Bedarf aus Beständen erzeugen". Dedup: ein auto-Eintrag pro Artikel.
- `generateAutoNeeds` (auch automatisch bei Inventur getriggert). Query-Layer `shopping-list.ts`,
  `getStockTargets`, API `/api/shopping-list` (GET/POST), `[id]` (PATCH/DELETE), `generate` (POST).

### Einbuchen (virtueller → echter Bestand)
- „Einbuchen"-Link je Einkaufslisten-Eintrag → easy-add mit Vorbelegung (Produkt/Menge/Einheit);
  nach dem Anlegen wird der Listeneintrag entfernt und zur Einkaufsliste zurückgeleitet.

### Commits
442a48d (FIFO-Logik + Tests) · 1c65424 (shopping-list Query + Bedarf) · dc9de60 (shopping-list API) ·
7a43b54 (Einkaufsliste-UI) · ab29d68 (Inventur-API + Modal) · ece8652 (Einbuchen)

### Test-Steps (Pi)
1. Artikel mit Soll → „Bestand korrigieren" auf niedrigeren Ist → Bestände FIFO reduziert, auto-Bedarf-Eintrag.
2. Einkaufsliste: auto + manuell, abhaken; „Bedarf erzeugen" ohne Duplikate.
3. „Einbuchen" → easy-add vorbelegt → speichern → Eintrag weg, neuer Bestand auf /inventar.

---

## [Unreleased] — Einheiten-Verwaltung + Inkrement 2b (Soll/Bedarf) (implementiert, Test auf Pi ausstehend)

### Einheiten-Verwaltungsseite
- Neue Unterseite **Einstellungen → Einheiten**: CRUD für Einheiten inkl. Dimension
  (Masse/Volumen/Stückzahl) + Umrechnungsfaktor zur Basiseinheit (g/ml). System-Einheiten read-only.
- **Vorschlags-Modal** gängiger Einheiten (mg, dag, Pfund, cl, EL, TL, Prise, Bund, …) — Klick übernimmt.
- `/api/units` POST+PATCH um dimension + toBaseFactor erweitert.
- Bisherige Inline-Einheiten-Section von der Einstellungen-Hauptseite auf die Unterseite verschoben (Tile).

### Inkrement 2b — Soll/Bedarf
- **Soll-/Mindestbestand je Artikel**: stock_targets-CRUD (Query-Layer + `/api/products/[id]/target` PUT/DELETE, Upsert).
- **Soll-Ist-Vergleich** `compareToTarget` (stock.ts, + Tests): ok / unter Soll / unter Min / nicht vergleichbar.
  mass/volume über Faktor, count symbolgenau.
- **Bedarf-Indikator** auf der Artikel-Detailseite (Ampel-Badge) + Modal zum Soll-Festlegen/Entfernen.

### Commits
34e4b4f (units-API dimension/factor) · 4ff5490 (Einheiten-Seite + Vorschläge) · 0b5b446
(compareToTarget + Tests) · d0ee0ed (stock-targets Query+API) · 0394380 (Soll-Indikator Detailseite)

### Test-Steps (Pi)
- Einstellungen → Einheiten: Einheit „EL/15 ml" per Vorschlag anlegen; eigene Masse-Einheit mit Faktor;
  System read-only; benutzte Einheit löschen → 409.
- Artikel-Detailseite: Soll „3 Stück" festlegen → bei Ist 1 „Unter Soll" (gelb), bei ≥3 grün, unter Min rot;
  Soll in Einheit ohne passenden Ist → „nicht vergleichbar".

---

## [Unreleased] — Inkrement 2a + FAB-Angleich (implementiert, Test auf Pi ausstehend)

### FAB-Buttons angeglichen
- „Neuer Artikel" + „Bestand hinzufügen" jetzt gleiche Größe (48px, gleiches Padding/Icon);
  Farb-Hierarchie bleibt (primär gefüllt vs. hell/outline). Mobile: beide gleich große Icon-Buttons.

### Gesamtbestand pro Artikel (2a) + Einheiten-Umrechnungsschicht
- **units** um `dimension` (mass|volume|count) + `to_base_factor` erweitert (Migration 0007;
  System-Units gebackfillt: g/kg → mass, ml/l → volume, Rest count).
- **lib/utils/stock.ts** (neu, reine Funktionen + 10 vitest-Tests): normalisiert mass/volume auf
  Basiseinheit und summiert, count-Einheiten (Stück/Packung/…) bleiben getrennt. Symbol-Kollision:
  Custom-Units vor System.
- `formatStockTotal` → „2 Packung + 1,5 kg". `getProductStockTotals` im Query-Layer.
- Artikel-Detailseite zeigt den **Gesamtbestand** über alle Bestände (mit „aus N Beständen").
- Erste vitest-Tests im Projekt.

### Commits
0efec01 (FAB-Angleich) · de024bf (units-Schema + Migration 0007) · 3594c0f (stock.ts + format) ·
72669a9 (vitest-Tests) · 849b013 (getProductStockTotals + Detailseiten-Header)

### Test-Steps (Pi)
Migration 0007 läuft automatisch beim Container-Start. Artikel mit gemischten Einheiten anlegen
(500 g + 1 kg + 2 Packung) → Detailseite zeigt „1,5 kg + 2 Packung"; consumed-Bestände zählen nicht mit.
FAB-Buttons gleich groß prüfen.

---

## [Unreleased] — Feedback-Runde 2: UI-Konsolidierung (implementiert, Test auf Pi ausstehend)

Reaktion auf UI-Kohärenz-Findings nach Feedback-Runde 1.

### Einheitliches Modal-Paradigma
- Neu `lib/components/Modal.svelte` — generisches zentriertes Modal (Svelte 5 Snippets:
  children + optional footer, size sm/md/lg, Escape + Backdrop schließen).
- **Alle Overlays konsolidiert**: "Neuer Artikel" (vorher Bottom-Sheet), Lagerort-Picker
  (vorher Custom-Dialog) und ConfirmModal nutzen jetzt dasselbe Modal.
- Totes Overlay-CSS entfernt (Sheet, Custom-Dialog, redundantes ConfirmModal-CSS).

### Inventar 3-Punkt-Menü vereinfacht
- "Bearbeiten" + "Bezugsquellen bearbeiten" zu EINEM Punkt **"Bearbeiten"** gemergt
  → führt zur Artikel-Detailseite. Toter `#bezugsquellen`-Hash entfernt.
- Sheet-Edit-Modus entfernt: Bestände bearbeitet man auf der Detailseite (Superset).

### Artikel-Verwaltung reduziert (Bestand ist führend)
- Einstellungen → Artikel pflegt nur noch **Name + Kategorie**. Einheit/Beschreibung/
  Notizen raus (Grund: Einheit kann pro Bestand variieren — der Bestand führt).
- "Standard-Einheit"-Anzeige auf der Detailseite entfernt.
- products.defaultUnit/description/notes-Spalten bleiben technisch (nicht mehr gepflegt).

### Nährwert-Editor Politur
- "+ Nährstoff"-Add-Zeile als placeholder-artiger Slot (gestrichelter Rahmen,
  Hover/Fokus → primary).

### Commits
7c81cf7 (Modal-Fundament) · 6effef4 (Sheet→Modal + Menü-Merge) · edccb4f (Lagerort→Modal +
Einheit-Anzeige raus) · b62b64d (Nährwert-Add-Zeile) · ec8acc7 (Artikel-Feldreduktion) ·
f0e3a58 (ConfirmModal DRY)

### Test-Steps (Pi)
1. Einstellungen → Artikel: nur Name + Kategorie editierbar (add + edit + Anzeige).
2. Inventar 3-Punkt → ein "Bearbeiten" → öffnet Detailseite (kein Sheet-Edit, kein toter Hash).
3. Modal-Konsistenz: "Neuer Artikel", Lagerort-Auswahl, Bestätigungen = gleiches zentriertes
   Modal; Escape + Backdrop schließen überall.
4. Nährwert-"+"-Zeile klar als Add-Slot erkennbar; add/edit/delete unverändert funktional.
5. Mobile 360–480px: Modals zentriert (bzw. bottom-aligned), kein Overflow.

---

## [Unreleased] — Feedback-Runde 1 (implementiert, Test auf Pi ausstehend)

Reaktion auf 5 Praxis-Findings nach Inkrement 1.

### Einheiten-Bug behoben
- Einstellungen → Artikel: Einheit-Feld ist jetzt ein **Dropdown** (statt Freitext),
  Auswahl aus getUnits (value=symbol, Anzeige=name) — konsistent mit Inventar/easy-add.
- Anzeige mappt gespeichertes symbol auf den Namen (z.B. "Packung" statt rohem Wert).
- Inventar-"Neuer Artikel" sendet die gewählte Einheit als `defaultUnit` mit
  (vorher stummer `'piece'`-Fallback → daher die "Packung → g/piece"-Diskrepanz).
- Defaults durchgängig auf symbol `'piece'` korrigiert.

### Nährwert-Editor (neu)
- Detailseite hat einen **editierbaren Nährwert-Editor** (produktweit, Hinweis
  "gilt für alle Bestände"): Zeile hinzufügen, Wert ändern, Zeile löschen.
- **Eigene Nährstofftypen** anlegbar (POST /api/nutrient-types, idempotent per Slug).
- Neue API: GET/POST /api/nutrient-types, PUT/DELETE /api/products/[id]/nutrients.
- Query-Layer: nutrients.ts (slugify, getNutrientTypes, createNutrientType,
  upsertProductNutrient, deleteProductNutrient).
- **Slug-Mismatch behoben**: der Editor arbeitet direkt gegen nutrient_types statt
  einer hartcodierten Bindestrich-Liste (Seed nutzt Unterstrich-slugs).

### Aggregierte Artikel-Detailseite
- /inventar/[id] zeigt jetzt den **Artikel mit ALLEN seinen Beständen** (mehrere
  MHDs/Mengen) statt eines einzelnen Bestands.
- Pro Bestand: Menge/Einheit/MHD+Badge/Markt/Ort/Status; **Inline-Edit** via
  bestehender PATCH /api/inventory/[id]; Verbraucht/Entfernen pro Zeile.
- **Bezugsquelle (Markt) editierbar** je Bestand; tote Bezugsquellen-UI/CSS-Reste entfernt.
- Behebt latenten data.units-Bug (Einheiten-Select auf Detailseite war leer).

### Responsive / Mobile
- Globaler Fix: (app)-Shell-Padding auf Mobile reduziert (behebt doppeltes Padding),
  body overflow-x:hidden als Sicherheitsnetz.
- artikel/maerkte: Felder brechen sauber auf volle Breite; inventar FAB-Labels ab
  ≤680px ausgeblendet; easy-add unit-row flex-wrap.

### Commits
e4d4b4c (Artikel-Einheit-Dropdown) · 3b79517 (defaultUnit-Kopplung) · da07d91
(nutrients Query-Layer) · 6d9bfa8 (/api/nutrient-types) · c83f1cc
(/api/products/[id]/nutrients) · ace56ed (aggregierte Detailseite + Editor) ·
035b911 (globaler Mobile-Fix) · 5c382c2 (Responsive-Fixes)

### Test-Steps (Pi)
1. Artikel mit "Packung" anlegen → Einstellungen → Artikel zeigt "Packung"; Feld = Dropdown.
2. Detailseite: Nährwert-Zeile add (Standard + eigener "Magnesium/mg"), Wert ändern,
   löschen → nach Reload persistent; alle Seed-Nährstoffe korrekt beschriftet.
3. Artikel mit 2+ Beständen → Detailseite listet alle; Inline-Edit (Menge/MHD/Markt/Ort)
   je Bestand persistiert.
4. Mobile 360–480px: kein horizontaler Overflow, Felder/FAB sauber.

---

## [Unreleased] — Inkrement 1: Kanonischer Modell-Umbau (implementiert, Test auf Pi ausstehend)

### Datenmodell
- **EAN ans Bestand**: `inventory_items.gtin` neu (Migration 0005). EAN ist jetzt
  Eigenschaft des konkreten Bestands, nicht des Artikels.
- **product_stores entfernt** (Migration 0005): Markt liegt am Bestand (`store_id`).
- **products.notes** neu (Migration 0006): Notizen als Artikel-Stammdaten.
- **products.gtin bleibt** — ausschließlich als interner Open-Food-Facts Cache-Schlüssel,
  nicht im UI, nicht das Bestand-EAN.
- **Testdaten-Reset**: `DELETE FROM inventory_items` in Migration 0005 (Modellwechsel).
  Artikel, Orte, Märkte bleiben erhalten.

### Query-Layer / API
- `listProducts()`, `updateProduct()` neu; `getProductById`/`createProduct` um
  description/notes/defaultUnit erweitert.
- `PATCH /api/products/[id]` neu (Stammdaten aktualisieren); `POST /api/products`
  akzeptiert notes und gibt vollen Artikel zurück.
- `api/product-stores/*` Routen entfernt.
- `api/stores/[id]` DELETE: Referenz-Check auf `inventory_items.store_id`.
- `api/barcode/[gtin]` gibt jetzt `product.id` zurück.

### UI — Zwei-Schritt-Flow
- **Artikel ≠ Bestand**: „Neuer Artikel" auf /inventar legt nur Stammdaten an
  (POST /api/products), kein Bestand.
- **Einstellungen → Artikel** (neue Seite): Artikel-Katalog anlegen/bearbeiten/löschen,
  Design analog Märkte, CRUD via /api/products, ConfirmModal, 409-Löschschutz.
- **„Bestand hinzufügen" (easy-add)** vervollständigt: EAN-Scan (Kamera → OFF-Lookup →
  Artikelvorschlag), Markt-Dropdown, Notiz je Bestand.
- Barcode-Scanner vom Artikel- ins Bestand-Formular verschoben.

### Commits
9689107 (Modell-Umbau) · f57688d (products.notes + Queries) · 7f651bb (PATCH API) ·
6b3ba93 (Artikelverwaltung) · 58115ce (Add-Sheet = Artikel) · 36bfa8d (easy-add EAN/Markt/Notiz)

### Test-Steps (Pi) — siehe docs/ROADMAP.md „Offene Punkte"
Deploy: `docker compose pull && docker compose up -d --force-recreate stoqr`,
dann `docker compose logs stoqr | grep "\[migrate\]"` (0005 + 0006 müssen laufen).

### Architektur-Entscheidungen (2026-07-11)
- **Universeller Master-Artikel**: EAN + Markt am Bestand, nicht am Artikel.
- Lagerort am Bestand. products global/geteilt. products.gtin = OFF-Cache.
- Bei Umstellung: neue Migration + Reset der Bestands-Testdaten.

---

## Bisherige Historie (vor Roadmap-Einführung)

### 2026-07-11
- Realtime Name-Update nach Artikel-Bearbeiten (kein Reload nötig)
- "Alles löschen" + "Aus Katalog entfernen" als direkte Aktionen im 3-Dot-Menü
- Kategorie-Emoji in Produktsuche gefixt (searchProducts join)
- Custom-Unit-Umbenennung propagiert zu allen betroffenen inventory_items
- Vollständiges Löschen mit Transaktion (Produkt + Bestände + Bezugsquellen)
- Einladungslink-Hinweis (stoqr versendet keine E-Mails)
- try/catch in allen inventory/products API-Handlern (keine Partialdaten mehr)
- ConfirmModal statt window.confirm überall
- MHD aus Artikelstamm-Formular entfernt (Bestand-Sektion nur im Edit-Modus)

### 2026-07-08 bis 2026-07-10
- Haushalts-Refactor: household_id auf allen Fachtabellen, Multi-User, Invite-System
- Märkte-Verwaltung, Bezugsquellen mit sort_order
- Easy-Add Flow, dynamische Units, Emoji-Picker mit Tabs
- Dark Mode (blau/indigo), Breadcrumb-Navigation
- Portal-Kontextmenü (z-index fix)
- Migration 0000–0004

### Deployment
- Repo: Labushuya/stoqr, Image: ghcr.io/labushuya/stoqr:main
- CI + Docker Publish grün, Migrationen laufen automatisch beim Container-Start
