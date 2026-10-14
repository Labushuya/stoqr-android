# stoqr-android — Handover für Opus 5.5

**Erstellt:** 2026-10-14  
**Vorherige Session:** Claude Sonnet (langer Verlauf seit v0.2.5 bis v0.2.8)  
**Repo:** `https://github.com/Labushuya/stoqr-android.git` · Branch `main`  
**Pi-Repo (getrennt):** `C:\Code\claude\stoqr` · Branch `feat/transfer-import-export`  
**Lokales Android-Repo:** `C:\Code\claude\apps\stoqr-android`

---

## 1. Projekt-Überblick

**stoqr** ist eine private Haushalts-Inventar-App. Zwei Targets, ein Codebase:

| Target | Stack | Beschreibung |
|---|---|---|
| **Pi** (`stoqr`) | SvelteKit + Node.js + PostgreSQL, Docker auf Raspberry Pi | Heimserver-Version, per Browser erreichbar |
| **Android** (`stoqr-android`) | SvelteKit + Capacitor + On-Device-SQLite | Offline-fähige Android-App, kein Server nötig |

Das Android-Repo ist ein **Fork/Derivat** des Pi-Repos. Getrennte Repos, gemeinsame `.svelte`-Komponenten. Code-Änderungen, die beide Seiten betreffen, werden manuell übertragen.

**App-ID:** `de.c0demon.stoqr` · **Haushalt:** „Die Merbotts"

---

## 2. Technischer Stack (Android-Repo)

```
apps/stoqr-android/
├── apps/web/              ← SvelteKit-App (haupt)
│   ├── src/
│   │   ├── routes/(app)/  ← Alle App-Seiten
│   │   ├── lib/
│   │   │   ├── client/
│   │   │   │   ├── api.ts                 ← apiFetch(): leitet an routeApp() oder echten Fetch
│   │   │   │   ├── api-router.app.ts      ← App-Target-Router (ersetzt Pi-HTTP-Handler)
│   │   │   └── data/queries/              ← Query-Funktionen (target-neutral, nutzen getDb())
│   │   └── app.css                        ← Globales Design-System
│   ├── capacitor.config.ts
│   ├── android/                           ← Capacitor Android-Projekt
│   └── package.json                       ← version: 0.2.8
├── packages/db/
│   ├── src/sqlite/                        ← SQLite-Schema + Migrations-Helfer
│   └── src/                               ← Drizzle-Schema (PostgreSQL, geteilt)
└── .github/workflows/
    ├── ci.yml
    └── release.yml                        ← Baut + signiert Release-APK bei Tag-Push
```

**Ziel-Architektur App-Target:**
- `apiFetch()` → `routeApp()` in `api-router.app.ts` → Query-Fns → On-Device-SQLite
- Kein echter HTTP-Server; alle Mutationen laufen direkt gegen SQLite
- `LOCAL_HOUSEHOLD_ID` / `LOCAL_USER_ID` (Konstanten) statt echter Auth
- **`__STOQR_TARGET__`** = Vite-Define für DCE: `'app'` | `'node'`
- Build-Kommando App: `pnpm --filter @stoqr/web run build:app` (adapter-static, stasht `*.server.ts`)

---

## 3. Aktueller Stand: v0.2.8 (dieser Commit)

### Was ist in v0.2.8 drin

**Commit `01010a9` (bereits gepusht):**  
App-weite Control-Vereinheitlichung — EIN autoritatives Control-Set in `app.css`; scoped Drift in 16 Seiten gelöscht; ProductForm (`.pf-*`) + MhdScanner (`.btn--*`) auf kanonische Klassen migriert. Höhen-Skala 30/36/40/44px. Dual-Build + 258 Tests grün.

**Dieser Commit (v0.2.8-finale)** umfasst zusätzlich die folgenden Punkte, die aus dem Geräte-Feedback kamen (Screenshots: `C:\Code\claude\misc\stoqr-android-*.jpeg`):

#### A — UI-Fixes (am Gerät per CDP verifiziert)

| Fix | Datei | Problem → Lösung |
|---|---|---|
| **A1** Titel-Umbruch | `inventar/[id]/+page.svelte` | `.product-name { word-break: break-word }` → bricht je Zeichen. Fix: `overflow-wrap: anywhere; word-break: normal` |
| **A2** Einheit-/Gebinde-Editor | `inventar/[id]/+page.svelte` | `.pack-edit` ohne einheitliche Höhen; Select ohne Breite; scoped 32px-Buttons. Fix: scoped Inline-Button-Drift entfernt (→ global 30px), Select `flex:1 1 140px; min-width:0` |
| **A3** MHD-Toleranz-Tabelle | `einstellungen/+page.svelte` | `table-layout:fixed` ohne `<colgroup>` → Namen abgeschnitten, Edit-Buttons überlappen. Fix: `<colgroup>` mit Spaltenbreiten, `.action-row > form { display:inline-flex }`, mobile Padding kompakter |
| **A5** Fach-Chip-Editor | `orte/+page.svelte` | Kein z-index-Bug! `.place-chip { height:30px }` enthält 40px-Icon → ragen in Nachbarzeilen. Fix: `.place-chip:has(.inline-edit) { height:auto; min-height:30px }`, kleiner Icon-Button, `places-grid align-items:flex-start` |
| **B** Breadcrumb | `datentransfer/+page.svelte` | Einzige Settings-Seite mit grauem `.back-link` statt kanonischem `.breadcrumb`. Fix: auf kanonische zweistufige Struktur umgestellt |

#### C — Aktivitäts-Log-Parität (funktionaler Fix)

- **Problem:** `api-router.app.ts` schrieb in keinem Mutationszweig `writeAudit()`. Die Aktivitäts-Seite `/aktivitaet` LIEST das Log aber on-device → zeigte immer „Noch keine Aktivität aufgezeichnet".
- **Fix:** `writeAudit` in **46 Stellen** im App-Router eingehängt, 1:1 spiegelnd zu den Pi-Handlern (`LOCAL_HOUSEHOLD_ID`/`LOCAL_USER_ID`). Abdeckung: `locations/storages/places/categories/category_mappings/inventory_items/product_prices/products/stock_targets/shopping_trips/shopping_trip_items/stores/units/household_reset/transfer_import`.
- **Verifiziert:** Aktivitäts-Seite zeigt nach einer echten Mutation Einträge (CDP-Test am Gerät).

#### D — Pi-Handover-Notiz

Neue Datei `docs/pi-mobile-ui-handover.md` dokumentiert, welche Fixes (A1–A5/B) auch für das Pi-Repo relevant sind und dort noch offen stehen. Fix C (Aktivitäts-Log) ist **Pi-exklusiv nicht nötig** (Pi-Handler schreiben bereits `writeAudit`).

---

## 4. Was noch offen ist (nächste Schritte)

### 4a. Release v0.2.8 — noch nicht getaggt

Der Code ist fertig, aber der GitHub-Release fehlt noch:
```bash
# Im stoqr-android-Repo:
git tag v0.2.8
git push origin v0.2.8
# → löst release.yml aus → baut + signiert APK → GitHub Release
```
**Voraussetzung:** Das Signing-Secret im GitHub-Repo muss korrekt sein.  
**Bekannter Blocker (aus Memory):** `stoqr-android-release-signing-secrets.md` — falsches Keystore-Passwort/Alias in GitHub-Secrets hatte den Release-Workflow blockiert (KeytoolException "final block not properly padded"). Stand dieser Session: Debug-APK lief am Gerät, Release-APK nicht getestet.

### 4b. Noch offene Gerätetests

- **#312** Gerätetest: Pi→App Tier 3 (Remap + GTIN-Dedup) — Transfer-Tier noch nicht vollständig getestet
- **#313** Gerätetest: App→Pi symmetrisch + Unknown-Kategorie-Warnung

### 4c. Pi-Repo: Branch noch nicht gemergt

Das Pi-Repo (`C:\Code\claude\stoqr`, Branch `feat/transfer-import-export`) hat die Transfer-Import-Export-Funktionalität als letzten Commit (`699f599`). Der Branch ist **noch nicht in `main` gemergt**. Dieser Branch sollte — sobald getestet — in den Pi-Main gemergt werden.

### 4d. Pi-Repo: mobile UI-Fixes ausstehend

Siehe `docs/pi-mobile-ui-handover.md`. Die 5 UI-Fixes aus dem Android-Feedback sind im Pi-Repo noch nicht übernommen.

### 4e. Roadmap-Items (Backlog)

Aus `docs/ROADMAP.md` — langfristig geplant, nicht begonnen:
- **M4** Rezepte + Personen/Portionen
- **Inkrement 2d** Bring!-API-Anbindung (verschlüsselte Credentials)
- **F2 Stufe 2** Headless-Chromium für JS-gerenderte Globus-Felder (Nährwerte, exaktes Pfand)
- **Gebinde-Nesting** (2-stufige Packung → Stück → Basis-Menge)

---

## 5. Technische Fallstricke + gesammelte Learnings

Diese Punkte sind aus echten Bugs entstanden und müssen beachtet werden. Alle Details in `C:\Users\I538150\.claude\projects\C--Code-claude\memory\`.

| Problem | Kurzbeschreibung | Memory-Datei |
|---|---|---|
| SQLite hat 29 Tabellen (nicht 22) | Schema-Provider-Muster: `setSchema(sqliteSchema)` beim Boot, `getDb()` in Query-Fns | `stoqr-android-schema-29-tables.md` |
| Kein On-Device-Migrationspfad | Boot-Self-Heal nötig (`ALTER TABLE ADD COLUMN IF NOT EXISTS`) — neue Schema-Spalten fehlen sonst auf Alt-Installs | `stoqr-android-no-ondevice-migration.md` |
| `.input min-height` statt `height` | In column-Flex kollabiert `height:40px` auf Inhaltsinhalt; nur `min-height` verhindert das | `stoqr-android-input-min-height-flex-collapse.md` |
| Postgres-Fallen im Bundle | `client.ts` lazy importieren, `hooks.server.ts` für App-Target kurzschließen | `stoqr-android-app-build-postgres-in-bundle.md` |
| Barrel zieht postgres in Client | Nur puren Subpath `@stoqr/db/sqlite` (nicht `@stoqr/db`) in `.svelte` importieren | `stoqr-android-barrel-pulls-postgres-in-client.md` |
| SQLite boolean-Codec | Rohe `.select({col})` umgeht `mode:boolean` → `0/1` statt `true/false`; immer `Boolean()` normalisieren | `stoqr-android-sqlite-proxy-select-boolean-codec.md` |
| Wipe-Cascade bei FKs aus | `PRAGMA foreign_keys=OFF` → `ON DELETE CASCADE` feuert nicht; Kinder explizit vorher löschen | `stoqr-android-wipe-cascade-fks-off.md` |
| Row-Shape bei `findFirst` | `.select()` liefert Array-of-Arrays — `mapped[0]` statt Array zurückgeben | `stoqr-android-sqlite-proxy-get-rowshape.md` |
| Svelte 5 stale `$derived` | Nach `invalidateAll()` lokalen `$state` aus `data.*` reseeden, NIE aus `$derived` | `stoqr-svelte5-stale-derived-reseed.md` |
| Svelte 5 Prop-Spiegel `$state` | Kein `$state` als Kopie eines lazy-nachgelieferten Props | `stoqr-svelte5-prop-mirror-state.md` |
| Release-Signing Blocker | PKCS12-Keystore: Key-PW == Store-PW; CI-Secrets müssen übereinstimmen | `stoqr-android-release-signing-secrets.md` |
| SPA `__data.json` 404 | `*.server.ts` beim App-Build stashen (via `scripts/build-app.mjs`) | `stoqr-android-spa-data-json-404.md` |

---

## 6. Entwicklungsumgebung

**Voraussetzungen:**
```bash
# Repo klonen
git clone https://github.com/Labushuya/stoqr-android.git
cd stoqr-android

# Dependencies
pnpm install

# Typecheck
pnpm run typecheck        # muss grün sein

# Tests
pnpm run test             # 258 Tests, alle grün

# App-Build (SPA für Android/Capacitor)
pnpm --filter @stoqr/web run build:app

# Pi-Build (Node.js-Server)
STOQR_TARGET=node pnpm --filter @stoqr/web run build
```

**Debug-APK bauen + auf Gerät installieren:**
```bash
cd apps/web
./node_modules/.bin/cap sync android
cd android && ./gradlew assembleDebug
# Dann:
adb install -r -d app/build/outputs/apk/debug/app-debug.apk
```

**CDP-Verifikation (WebView-Debugging):**
```bash
# adb unter C:\Users\<user>\Android\Sdk\platform-tools\adb.exe
adb forward tcp:9333 localabstract:webview_devtools_remote_<PID>
# PID aus: adb shell cat /proc/net/unix | grep webview_devtools_remote
# Dann Playwright connectOverCDP('http://localhost:9333')
```
→ Verifizierungs-Script: `scripts/verify-controls.mjs`

**Honor-Gerät Screenshot-Hinweis:** `adb screencap` liefert schwarzes Bild (Dual-Display). Verwende `adb exec-out cat /sdcard/s.png > local.png` nach `adb shell screencap -p /sdcard/s.png`. CDP-Geometrie ist zuverlässiger.

---

## 7. Design-System

**Globales Control-Set:** `apps/web/src/app.css`  
**Kanonische Höhen-Skala:** xs=30px (Inline), sm=36px (Ghost/Chip), base=40px (Primary/Input), lg=44px (CTA)  
**Focus-Ring:** `0 0 0 3px var(--color-primary-subtle)` (dark-safe, ersetzt hartkodiertes `rgba(196,103,58,.15)`)  
**Tokens:** `--color-*`, `--space-*`, `--radius-*`, `--text-*`, `--font-*` in `app.css`

Regel: **Scoped Stile in `.svelte`-Dateien dürfen NUR Layout-Modifier sein** (flex-basis, min-width, width-Modifier). Visuelle Optik (Farben, Höhen, Radius, Transitions) gehört ausschließlich in `app.css`. Scoped `.btn-primary` überschlägt globale `.btn-primary` wegen Svelte-Hash-Spezifität (0-2-0 > 0-1-0) — deshalb scoped Optik-Regeln immer entfernen, nicht hinzufügen.

---

## 8. Test-Manifest

`docs/test-manifest.html` — interaktives Abhak-Manifest (im Browser öffnen):  
- **Blöcke A–E + F/F2 + G1–G61:** vollständige Feature-Tests + Regressions-Verifikation  
- **Block G61** (neu in v0.2.8): Regressions-Verifikation der 5 Feedback-Punkte aus dem letzten Gerätetest  
- Export-Button: Markdown-Ergebnis in Zwischenablage → an Claude übergeben  
- localStorage-Key: `stoqr-test-manifest-v1` (getrennt von Pi-Manifest)

---

## 9. Zwei-Repo-Strategie (wichtig!)

| | stoqr-android | stoqr (Pi) |
|---|---|---|
| Zweck | Android-App (offline, Capacitor) | Raspberry-Pi-Server (online, Docker) |
| Branch | `main` (stabil) | `feat/transfer-import-export` (noch nicht in main) |
| DB | On-Device SQLite | PostgreSQL |
| Auth | Kein Auth (`LOCAL_HOUSEHOLD_ID`) | Echter Login (Lucia + Sessions) |
| Aktivitäts-Log | jetzt voll (v0.2.8) | war schon voll (Pi-Handler) |
| Mobile-UI-Fixes | v0.2.8 drin | **noch ausstehend** (`docs/pi-mobile-ui-handover.md`) |

**Regel:** Pi-Repo **niemals** mit Android-Repo mischen (kein `git pull` im falschen Verzeichnis). Beide haben eigene `origin`-Remotes.

---

## 10. Sofortiger nächster Schritt

1. **Release v0.2.8 taggen** (falls Signing-Secrets korrekt):
   ```bash
   cd C:\Code\claude\apps\stoqr-android
   git tag v0.2.8 && git push origin v0.2.8
   ```
2. **Gerätetests #312 + #313** (Pi↔App Transfer-Tier 3) abschließen
3. **Pi-Branch mergen** (`feat/transfer-import-export` → `main` im Pi-Repo), nachdem die Tests grün sind
4. **Mobile-UI-Fixes ins Pi-Repo** übertragen (siehe `docs/pi-mobile-ui-handover.md`)
