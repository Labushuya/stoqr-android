# Pi-Handover: Mobile-UI-Fixes aus dem stoqr-android-Feedback (v0.2.8)

**Zweck:** Diese Datei sammelt die UI-Fixes, die am **stoqr-android**-Repo aus dem Geräte-Feedback (Testrunde v0.2.6/0.2.7) gemacht wurden und die **auch die mobile Darstellung der Pi-Web-App** betreffen. Wenn wir die Pi-Version (`C:\Code\claude\stoqr`) weiterentwickeln, können diese Diffs 1:1 übernommen werden — die betroffenen `.svelte`-Dateien/CSS sind zwischen beiden Repos weitgehend baugleich.

**Stand:** zuerst in stoqr-android umgesetzt. Pi noch offen.

**Wichtig — was NICHT hierher gehört:** Der Aktivitäts-Log-Fix (`writeAudit` im App-Router `api-router.app.ts`) ist **rein App-spezifisch**. Die Pi-Handler (`routes/api/**/+server.ts`) schreiben bereits bei jeder Mutation `writeAudit(...)` — **Pi ist davon NICHT betroffen**.

---

## 1. Artikel-Detail: Titel bricht Zeichen-für-Zeichen um

- **Datei:** `apps/web/src/routes/(app)/inventar/[id]/+page.svelte`
- **Ursache:** `.product-name { word-break: break-word }` bricht mitten im Wort (im engen Flex-Kontext quasi je Zeichen).
- **Fix:** `word-break: break-word` → `overflow-wrap: anywhere; word-break: normal`.
- **Sweep:** auch `.field-map-val` in `einstellungen/+page.svelte` (gleicher Ersatz).

## 2. Standard-Einheit- / Gebinde-Inline-Editor chaotisch

- **Datei:** `apps/web/src/routes/(app)/inventar/[id]/+page.svelte`
- **Ursache:** `.pack-edit` (flex-wrap) ohne einheitliche Control-Höhe; das `<select class="input">` ohne feste Breite; scoped `.btn-save-inline/.btn-cancel-inline/.btn-edit-inline` mit abweichender Höhe (32px) statt der globalen 30px.
- **Fix:** scoped Inline-Button-Optik entfernt (fällt auf globales app.css-Set zurück, einheitlich); dem nackten Select im Editor `flex:1 1 140px; min-width:0` gegeben (`.pack-edit > .input:not(.pack-input):not(.pack-dim)`); `.pack-edit` bekam `min-width:0`.

## 3. MHD-Toleranz-nach-Kategorie-Tabelle

- **Datei:** `apps/web/src/routes/(app)/einstellungen/+page.svelte`
- **Ursache:** `.table { table-layout: fixed }` OHNE `<colgroup>`/Spaltenbreiten → Kategorienamen brechen/werden abgeschnitten; Aktion-Spalte zu schmal → im Edit-Modus stapeln/überlappen Speichern+Abbrechen (das `<form>` um Speichern nahm als Block volle Breite).
- **Fix:** `<colgroup>` mit `.col-cat(auto)/.col-tol(92px)/.col-act(168px)`; `.cat-name { min-width:0; overflow-wrap:anywhere }` + `.td:first-child { white-space:normal; overflow-wrap:anywhere }`; `.action-row { flex-wrap:nowrap }` + `.action-row > form { display:inline-flex; margin:0 }`; mobile (`max-width:560px`) kompakteres Button-Padding + `.col-tol 64px / .col-act 148px`.

## 4. Räume/Fach-Chip-Inline-Editor überlappt Nachbarzeilen

- **Datei:** `apps/web/src/routes/(app)/orte/+page.svelte`
- **Ursache:** KEIN z-index-Bug. `.place-chip { height:30px; border-radius:full }` (Pille) enthält im Edit-Zustand einen 40px-`.icon-btn` + Input + Buttons → Controls ragen aus der 30px-Box in Nachbarzeilen; `.places-grid` reserviert nur 30px Zeilenhöhe.
- **Fix:** `.places-grid { align-items: flex-start }`; `.place-chip:has(.inline-edit) { height:auto; min-height:30px; padding:var(--space-1) var(--space-2); border-radius:var(--radius-md); background:var(--color-surface) }`; `.place-chip .inline-edit--chip .icon-btn { width:32px; height:30px; font-size:16px }`.
- Hinweis: `:has()` — Browser-Support auf Ziel-WebView/Chromium ok; für ältere Pi-Client-Browser ggf. gegen eine Editing-Klasse am Chip tauschen, falls nötig.

## 5. Import/Export: Breadcrumb-Parität

- **Datei:** `apps/web/src/routes/(app)/einstellungen/datentransfer/+page.svelte`
- **Ursache:** einzige Settings-Unterseite mit grauem einstufigem `.back-link` statt kanonischer `.breadcrumb`.
- **Fix:** Markup + CSS auf die kanonische `.breadcrumb`-Struktur (`.breadcrumb / .breadcrumb-back / .breadcrumb-sep / .breadcrumb-current`, zweistufig „‹ Einstellungen / Import / Export", orange) umgestellt — 1:1 wie `kategorien/einheiten/maerkte/mitglieder/artikel/kategorie-zuordnung`.

---

## Übernahme-Hinweis für Pi

Die Pfade sind im Pi-Repo identisch (`apps/web/src/routes/(app)/…`). Vor Übernahme prüfen, ob die Pi-Version dieselben scoped-Klassen/Strukturen hat (nach dem letzten Vereinheitlichungs-Stand sollte das app.css-Control-Set dort ebenfalls existieren). Nach Übernahme: mobile Ansicht (schmaler Viewport) je Punkt gegenchecken — Overflow, Button-Höhen, Umbruch.
