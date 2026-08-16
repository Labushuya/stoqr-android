<div align="center">

<img src="./docs/banner.svg" alt="stoqr Android — Offline food inventory" width="100%"/>

<p>&nbsp;</p>

[![CI](https://github.com/Labushuya/stoqr-android/actions/workflows/ci.yml/badge.svg)](https://github.com/Labushuya/stoqr-android/actions/workflows/ci.yml)
[![GitHub release](https://img.shields.io/github/v/release/Labushuya/stoqr-android?sort=semver&color=C4673A)](https://github.com/Labushuya/stoqr-android/releases)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-7A9E7E.svg)](./LICENSE)
[![Android](https://img.shields.io/badge/Android-APK-3DDC84?logo=android&logoColor=white)](https://github.com/Labushuya/stoqr-android/releases)
[![Capacitor](https://img.shields.io/badge/Capacitor-8-119EFF?logo=capacitor&logoColor=white)](https://capacitorjs.com/)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.x-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-on--device-003B57?logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Offline-first](https://img.shields.io/badge/Offline-first-4A4A35)](#)

</div>

---

## Was ist stoqr Android?

stoqr Android ist die **eigenstaendige Android-App** zum [stoqr](https://github.com/Labushuya/stoqr)-Projekt
zur Verwaltung von Lebensmitteln im Haushalt. Die App ist **komplett offline nutzbar** — kein Server, kein
Cloud-Account, kein Online-Zwang. Alle Daten liegen lokal in einer On-Device-SQLite-Datenbank auf dem Geraet.

Wer zusaetzlich eine stoqr-Instanz auf dem Pi betreibt, kann App und Pi **unabhaengig voneinander** nutzen
und **bei Bedarf bidirektional synchronisieren**. Das **fuehrende System** bei Konflikten ist dabei
**waehlbar** (App oder Pi). Ist keine Pi-Verbindung gepflegt, laeuft die App rein standalone und ist damit
selbst das fuehrende System.

- Vollstaendig offline: Anlegen, Scannen, Vorrat verwalten — ohne Netz
- Barcode-Scan direkt ueber die Kamera (ZXing, on-device)
- MHD-Ampel mit farbiger Warnung
- Vorrat (Ist) und Bedarf (Soll) → automatische Einkaufsliste
- Optionaler On-Demand-Sync mit der Pi-Instanz, fuehrendes System waehlbar

> **Herkunft:** Dieses Repo ist von [Labushuya/stoqr](https://github.com/Labushuya/stoqr) abgeleitet und fuer
> den eigenstaendigen Android-Einsatz angepasst. Die Domain-Logik (Bestandsaggregation, Einheiten, MHD,
> Preise) wird verbatim uebernommen; ergaenzt wurde eine On-Device-Datenschicht und die Android-Verpackung.

---

## Installation

1. Neueste **APK** unter [Releases](https://github.com/Labushuya/stoqr-android/releases) herunterladen.
2. APK auf dem Android-Geraet oeffnen (Installation aus unbekannten Quellen ggf. erlauben).
3. App starten — beim ersten Start werden Kategorien und Naehrwert-Typen automatisch angelegt (Seeding).

Die App ist danach sofort offline nutzbar. Kein Login noetig.

---

## Features

| Feature | Status |
|---|---|
| 📴 Eigenstaendige Offline-Nutzung (On-Device SQLite) | Phase 1 |
| 📍 Ortsverwaltung (Raum → Schrank → Fach) | Phase 1 |
| 📦 Artikel-Inventar (Barcode, Menge, MHD) | Phase 1 |
| 🚦 MHD-Ampel mit konfigurierbarer Toleranz | Phase 1 |
| 📷 Barcode-Scan via Kamera (ZXing, on-device) | Phase 1 |
| 📝 OCR MHD-Erkennung (Tesseract.js, in-browser) | Phase 1 |
| 🛒 Vorrat/Bedarf-Delta → automatische Einkaufsliste | Phase 1 |
| 🔍 Open Food Facts Auto-Fill (nur online) | Phase 1 |
| 🔄 On-Demand-Sync mit Pi (read-only Pull) | Phase 2 (geplant) |
| ↔️ Bidirektionaler Sync, fuehrendes System waehlbar | Phase 3 (geplant) |
| 🖼️ Bilder/Media-Sync | Phase 4 (geplant) |

---

## Fuehrendes System (Sync-Konzept)

- **Standalone (Default):** Keine Pi-URL gepflegt → die App ist autark und selbst das fuehrende System.
- **Mit Pi gekoppelt:** In den Einstellungen wird das **fuehrende System** gewaehlt (App oder Pi). Bei einem
  echten Konflikt (beide Seiten haben denselben Datensatz geaendert) gewinnt das gewaehlte fuehrende System;
  der ueberschriebene Stand wird protokolliert (kein stiller Datenverlust).

> In Phase 1 ist die Sync-Auswahl in den Einstellungen bereits sichtbar, aber noch ohne Wirkung — der
> Netz-Sync folgt in Phase 2–4.

---

## Tech Stack

| Schicht | Technologie | Warum |
|---|---|---|
| UI | [SvelteKit 2](https://kit.svelte.dev/) + [Svelte 5](https://svelte.dev/) | Uebernommen aus stoqr, verbatim |
| App-Huelle | [Capacitor](https://capacitorjs.com/) | Duenne native Huelle, signierte APK, Kamera/SQLite |
| Lokale DB | [SQLite](https://www.sqlite.org/) via [@capacitor-community/sqlite](https://github.com/capacitor-community/sqlite) | On-Device, offline |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) | Gleiche Query-Logik gegen SQLite (App) und Postgres (Pi) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) | Uebernommen aus stoqr |
| Barcode | [@zxing/browser](https://github.com/zxing-js/library) | On-device, kein Server-Roundtrip |
| OCR | [Tesseract.js](https://github.com/naptha/tesseract.js) | MHD-Erkennung, in-browser |
| Produkt-Lookup | [Open Food Facts API](https://world.openfoodfacts.org/) | Nur online; offline graceful degrade |
| CI/CD | GitHub Actions | Signierte APK am Release |

---

## Entwicklung

```bash
git clone https://github.com/Labushuya/stoqr-android.git
cd stoqr-android
pnpm install

# Web-Gate (typecheck/lint/build/test)
pnpm --filter @stoqr/web run typecheck && pnpm --filter @stoqr/web run test

# Statisches App-Bundle bauen (SPA-Target)
pnpm --filter @stoqr/web run build:app

# Android-Projekt syncen und bauen
npx cap sync
# ... Gradle assembleDebug / assembleRelease (siehe .github/workflows/release.yml)
```

Weitere Details: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## Lizenz

[AGPL-3.0](./LICENSE) — Nutzung und Weiterverbreitung erlaubt, Aenderungen muessen als Open Source
veroeffentlicht werden.

---

<div align="center">

*Eigenstaendige Offline-App. Optional bidirektional mit dem Pi. Fuehrendes System waehlbar.*

</div>
