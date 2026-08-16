# stoqr — Finales HomeNexus/fam.ily Handover für Claude Code CLI

Du arbeitest am Repo:

```text
Labushuya/stoqr
```

Ziel ist **nicht generisches Self-Hosting**, sondern ausschließlich Christophers bestehendes privates HomeNexus-/`fam.ily`-Setup.

---

## 1. Rollenmodell ab jetzt

### Claude Code CLI

Claude entwickelt, pflegt das GitHub-Repo, erstellt fokussierte Commits und published das Docker-Image nach GHCR.

### Christopher

Christopher testet ausschließlich auf seinem HomeNexus-Setup und berichtet Testergebnisse an Claude zurück.

### ChatGPT

ChatGPT fungiert nur noch als Berater, Koordinator und Handover-Formulierer. ChatGPT ändert keinen Repo-Code.

Ab jetzt gilt:

```text
Vor jedem repo-bezogenen Beratungsschritt:
- ChatGPT prüft aktuelle GitHub-Repo-Infos
  oder
- fragt Christopher nach dem aktuell getesteten Commit/Image.

Nicht repo-bezogene Dinge:
- Testprotokoll strukturieren
- Pi-Kommandos interpretieren
- Logs bewerten
- Handover formulieren

erfordern keinen lokalen Repo-Pull.
```

---

## 2. Christophers Zielumgebung

```text
Host: Raspberry Pi 5
Hostname: homenexus
User: ambersador
Pi-IP: 192.168.178.123
Domain: https://stoqr.fam.ily
DNS: Pi-hole / lokale fam.ily-Zone
Reverse Proxy: Traefik
Docker Netzwerk: proxy
Stack-Pfad: /srv/hubdata/stacks/stoqr/docker-compose.yml
State-Pfad: /srv/hubdata/state/stoqr
Postgres-State: /srv/hubdata/state/stoqr/postgres
Env-Datei: /srv/hubdata/state/stoqr/.env
Image: ghcr.io/labushuya/stoqr:main
Compose-Template: docs/docker-compose.fam.ily.yml
hubctl Descriptor: .hubctl.json im Repo-Root
```

Wichtig:

```text
Nicht nach generischem README deployen.
Nicht generisches docker-compose.yml blind verwenden, wenn docs/docker-compose.fam.ily.yml relevant ist.
Nicht letsencrypt/certresolver blind übernehmen.
Nicht fam.ily/family.hub/love.notes/Pi-hole/Traefik/CA-Portal beschädigen.
```

Die Zielroute bleibt:

```text
https://stoqr.fam.ily
```

Nicht bevorzugt:

```text
https://fam.ily/stoqr
```

---

## 3. Repo-/Release-Stand

Aktueller Arbeitsmodus:

```text
Branch: main
Image: ghcr.io/labushuya/stoqr:main
Releases: keine stabilen Releases als primärer Testkanal
```

Christopher testet derzeit `main`/GHCR `main`, nicht versionierte Release-Tags.

Alles, was im Repo, in der README oder in Claudes Eigenzusammenfassung als „funktioniert“ steht, gilt erst dann als bestätigt, wenn Christopher es auf seinem HomeNexus getestet hat.

Besonders gilt das für:

```text
- Household/Multi-User
- Invite-System
- Märkte / Einkaufsquellen
- Bezugsquellen mit sort_order
- Barcode-Scanner
- OCR-MHD-Scanner
- Easy-Add
- Inventar-Items CRUD
- Einkaufsliste
- Bring!-Integration
```

Statusregel:

```text
Laut Claude implementiert ≠ von Christopher bestätigt.
```

---

## 4. Zwingende Arbeitsweise für Claude

Bitte diese Arbeit **nicht monolithisch** in einem einzigen langen Kontextdurchlauf erledigen.

Die bisherigen Iterationen haben gezeigt, dass zu breite Aufgaben dazu führten, dass Punkte untergingen, teilweise umgesetzt wurden oder Regressionen entstanden.

Arbeite deshalb in Subtasks/Subagents oder streng getrennten Abschnitten:

```text
1. Audit: zugesagt vs. umgesetzt vs. offen
2. Reproduktions-/Smoke-Test des aktuellen Deployments
3. P0-Regressionen fixen
4. Artikelstamm vs. Bestand prüfen/korrigieren
5. Easy-Add / Bestand hinzufügen prüfen/korrigieren
6. Delete-Semantik prüfen/korrigieren
7. Märkte / Bezugsquellen prüfen/korrigieren
8. Mobile-first / Responsive UI prüfen/korrigieren
9. Overlay/Z-Index/3-Dot-Menüs prüfen/korrigieren
10. Regressionstests
11. Erst danach Commit + GHCR Publish
```

Pro Commit:

```text
Eine fokussierte Änderung pro Commit.
Keine Sammel-PRs.
Vor jedem Commit: Typecheck, Lint, Build.
Regressionen aktiv testen.
DB-Migrationen explizit dokumentieren.
Breaking Changes explizit dokumentieren.
Bei P0-Bugs: keine neuen Features vor P0-Fixes.
```

Nicht erlaubt:

```text
- Alles auf einmal halb patchen.
- Funktionierende Bereiche unnötig umbauen.
- UI-Regressionen erzeugen, während nur Logik gefixt werden soll.
- Fehler im UI melden, obwohl partiell gespeichert wurde.
- Anforderungen stillschweigend auslassen.
```

---

## 5. Audit-Pflicht vor neuer Umsetzung

Vor Codeänderungen bitte einmalig klar ausgeben:

```text
Umgesetzt:
- ...

Offen:
- ...

Regressionen:
- ...

Bewusst verschoben:
- ...

Laut Code vorhanden, aber durch Christopher noch nicht bestätigt:
- ...
```

Diese Audit-Liste ist zwingend, weil mehrfach Punkte für ein Release erwartet wurden, die im getesteten Deployment nicht sichtbar oder nicht funktional waren.

---

## 6. Was bisher als funktionierend galt und nicht regressieren darf

Diese Punkte waren in vorherigen Tests grün oder weitgehend grün und müssen erhalten bleiben:

```text
- https://stoqr.fam.ily erreichbar
- Container healthy
- Healthcheck über http://127.0.0.1:3000/api/health funktioniert
- Login Christopher funktioniert
- Persistenz nach Container-Neustart funktioniert
- Top Nav ohne Reload sichtbar
- Direkt /orte öffnen funktioniert
- Einstellungen → Mitglieder sichtbar
- Einstellungen → Einheiten sichtbar
- Unit-Verwaltung grundsätzlich funktional
- Verwendete Einheiten können nicht gelöscht werden
- Einheiten-Layout stabil
- Dark Mode blau/lila
- Light Mode weiterhin okay
- Emoji-Picker funktional
- Ort/Lagerort Emoji speichern + Reload funktionierte
- /einkaufsliste war zuletzt kein 404 mehr
```

Diese Punkte sind Regressionstests.

---

## 7. Aktueller kritischer Stand

**Baseline 2026-08-14:** Christopher hat den kompletten Test-Manifest-Durchlauf **A–E, 214/214 Punkte, als getestet und
funktional bestätigt** (Stand Commit `7c2d49c`, `ghcr.io/labushuya/stoqr:main`) — inklusive des angezeigten Namens
„Die Merbotts" (G52) und der Gefahrenzone mit dreistufigem Werksreset (G53). **Wichtig:** Stufe C des Werksresets
re-seedet Kategorien + Nährwert-Typen jetzt **automatisch in derselben Transaktion** — nach einem Werksreset ist
**kein manuelles `seed.sql`** mehr nötig (echter Frischstart ohne Nachpflege). Dieser Stand gilt als **auf dem Pi
verifizierte Baseline** (löst die frühere 203/203-Baseline auf Commit `d7290aa` ab). Details: `CHANGELOG.md`
(Eintrag „Angezeigter Name Die Merbotts + Gefahrenzone") und `docs/ROADMAP.md` (Baseline-Banner + Feature-Einträge
G52/G53).

Ab dieser Baseline gilt: der jeweils **neueste** Commit ist erst dann als funktionierend anzunehmen, wenn Christopher ihn
auf dem Pi getestet und zurückgemeldet hat (Format siehe §12). Vor jedem Test zieht Christopher das Image und prüft den
SHA gegen den erwarteten Commit.

Die früheren Minimaltests (Artikel bearbeiten, MHD-Felder, Kategorie speichern, Löschen-Modal, keine partiellen
Datensätze) sind Teil der bestätigten Baseline und gelten als grün.

---

## 8. GitHub-/Deployment-Ablauf für Christopher

### 8.1 Wann lokaler Repo-Pull nötig ist

Christopher zieht lokal nur dann, wenn er testen/deployen will oder lokale Repo-Dateien braucht.

Nicht jeder Beratungs- oder Logauswertungs-Schritt braucht lokalen Pull.

Wenn getestet/deployed wird:

```cmd
cd /d H:\DEV\github\stoqr
git fetch origin
git pull --ff-only origin main
git log -1 --oneline
git status
```

Erwartung:

```text
working tree clean
```

Wenn lokale Änderungen vorhanden sind: nicht deployen, erst klären.

---

### 8.2 Pi: Backup vor Tests/Deployment

```bash
mkdir -p /srv/hubdata/backups/stoqr

docker exec stoqr-postgres-1 pg_dump -U stoqr -d stoqr \
  > /srv/hubdata/backups/stoqr/stoqr-before-next-test-$(date +%Y%m%d-%H%M%S).sql

cp /srv/hubdata/state/stoqr/.env \
  /srv/hubdata/backups/stoqr/env-before-next-test-$(date +%Y%m%d-%H%M%S).backup

ls -lh /srv/hubdata/backups/stoqr | tail
```

---

### 8.3 Pi: Image ziehen und Stack recreaten

```bash
cd /srv/hubdata/stacks/stoqr
docker compose pull stoqr
docker compose up -d --force-recreate stoqr
sleep 60
docker compose ps
```

Erwartung:

```text
stoqr-postgres-1   healthy
stoqr-stoqr-1      healthy
```

Image-/Containerstand dokumentieren:

```bash
docker image inspect ghcr.io/labushuya/stoqr:main \
  --format 'ImageId={{.Id}} Created={{.Created}} RepoDigests={{join .RepoDigests " "}}'

docker inspect stoqr-stoqr-1 \
  --format 'ContainerImage={{.Image}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{end}}'
```

---

### 8.4 Pi: Smoke-Test

```bash
docker exec stoqr-stoqr-1 wget -qO- http://127.0.0.1:3000/api/health
curl -k -i https://stoqr.fam.ily/ | head -5
```

Erwartung:

```text
{"ok":true,...}
HTTP/2 200
```

**WICHTIG — `/login` bei aktivem AUTH_DISABLED:** Ist `AUTH_DISABLED=true`
gesetzt (Login abgeschaltet, App laedt direkt), leitet `/login` **absichtlich**
auf `/` um. Der richtige "App laedt"-Check ist dann die Wurzel `/` (siehe oben),
NICHT `/login`.

```bash
# Nur bei AUTH_DISABLED=true — Erwartung: HTTP/2 302 + location: /
curl -k -i https://stoqr.fam.ily/login | head -5
```

| Zustand              | `curl .../login` erwartet | `curl .../` erwartet |
|----------------------|---------------------------|----------------------|
| AUTH_DISABLED=true   | HTTP/2 **302**, location: / | HTTP/2 **200** (App) |
| Login aktiv (Flag weg)| HTTP/2 **200** (Login-Seite)| HTTP/2 302 -> /login (ohne Session) |

Das `302 -> /` auf `/login` ist bei aktivem Flag also das **gewuenschte**
Ergebnis, kein Fehler — es beweist, dass der Login-Bypass greift.

Logs/Migrationen prüfen:

```bash
docker compose logs stoqr | grep -Ei "migrat|0002|0003|0004|0005|stores|products|inventory|soft|delete|stock|household"
```

Wenn Fehler/Stacktrace/500 auftauchen: nicht weiter testen, erst Logs analysieren.

---

### 8.5 Login abschalten / wieder anschalten (AUTH_DISABLED)

Der Login ist per ENV-Flag `AUTH_DISABLED` schaltbar. Kein Code-, Schema- oder
Datenverlust — reiner Bypass, jederzeit reversibel.

- **AUTH_DISABLED=true**  -> Login AUS. `https://stoqr.fam.ily` laedt direkt die
  App als der erste (aelteste) vorhandene Nutzer/Haushalt. `/login` -> 302 auf /.
  "Abmelden" ist ausgeblendet.
- **Flag entfernt / != "true"** -> Login AN, exakt wie vorher. Register/Login-Seiten
  und Better Auth sind unveraendert vorhanden (nichts wurde entfernt).

Die Variable liegt in der Pi-.env: `/srv/hubdata/state/stoqr/.env`. Das Compose
spiegelt sie zusaetzlich explizit ins Container-Env (`environment:`-Block), damit
sie garantiert ankommt.

**Login ABSCHALTEN:**

```bash
# 1) Flag in die .env schreiben (falls noch nicht vorhanden)
grep -q '^AUTH_DISABLED=' /srv/hubdata/state/stoqr/.env \
  && sed -i 's/^AUTH_DISABLED=.*/AUTH_DISABLED=true/' /srv/hubdata/state/stoqr/.env \
  || echo 'AUTH_DISABLED=true' >> /srv/hubdata/state/stoqr/.env

# 2) Container NEU ERZEUGEN (nicht nur restart! env_file wird nur bei recreate neu gelesen)
cd /srv/hubdata/stacks/stoqr
docker compose up -d --force-recreate stoqr

# 3) Beweis: Variable ist jetzt im Container
docker exec stoqr-stoqr-1 printenv AUTH_DISABLED   # erwartet: true
```

**Login WIEDER ANSCHALTEN (Accounts zurück):**

```bash
# 1) Zeile aus der .env entfernen (oder auf false setzen)
sed -i '/^AUTH_DISABLED=/d' /srv/hubdata/state/stoqr/.env

# 2) Container neu erzeugen
cd /srv/hubdata/stacks/stoqr
docker compose up -d --force-recreate stoqr

# 3) Beweis: Variable ist weg
docker exec stoqr-stoqr-1 printenv AUTH_DISABLED   # erwartet: leer

# 4) Login-Seite ist wieder eine echte 200-Seite
curl -k -i https://stoqr.fam.ily/login | head -5   # erwartet: HTTP/2 200
```

> **Fallstrick (einmal reingefallen):** `docker compose restart` reicht NICHT —
> `env_file` wird nur beim **Neu-Erzeugen** (`up -d --force-recreate`) neu gelesen.
> Nach einem blossen restart bleibt die alte Env im Container. Immer `--force-recreate`.

> **Leere DB:** Existiert noch KEIN Nutzer (fabrikneue DB), liefert der Bypass
> keine Identitaet und faellt bewusst auf den normalen Login-/Register-Pfad zurueck
> — so kann man sich den ersten Account noch anlegen und sperrt sich nicht aus.

---

## 9. P0-Themen

### P0.1 Artikelstamm vs. Bestand strikt trennen

Grundsatz:

```text
Artikel anlegen = Stammdatenpflege.
Bestand hinzufügen = Transaktion / Inventarisierung.
```

Artikelstamm enthält:

```text
- Name
- Kategorie
- Barcode / GTIN
- Standard-Einheit
- Nährwerte
- Bezugsquellen
- ggf. Beschreibung/Notiz
```

Artikelstamm enthält nicht:

```text
- MHD
- konkrete Menge
- konkrete Charge
- konkrete einzelne Lagerposition
```

Bestand enthält:

```text
- product_id
- quantity
- unit_id
- expiry_date / MHD
- location_id optional
- storage_id optional
```

Akzeptanz:

```text
Neuer Artikel kann ohne MHD angelegt werden.
MHD-Felder sind aus Artikelanlage/Bearbeiten komplett entfernt.
MHD wird nur beim Bestand erfasst.
```

---

### P0.2 Artikel bearbeiten muss funktionieren

Vorherige Regression:

```text
Kein Bearbeiten von Artikeln mehr möglich.
```

Akzeptanz:

```text
1. Artikel anlegen.
2. Artikel bearbeiten öffnen.
3. Name ändern.
4. Kategorie ändern.
5. Einheit ändern.
6. Speichern.
7. Reload.
8. Änderungen bleiben erhalten.
```

---

### P0.3 Kategorie-/Emoji-/Suchanzeige dauerhaft stabilisieren

Dieser Bug trat mehrfach wieder auf.

Akzeptanz:

```text
- Kategorie wird beim Create gespeichert.
- Kategorie wird beim Update gespeichert.
- Suche zeigt korrektes Kategorie-Icon.
- Easy-Add-Suche zeigt korrektes Kategorie-Icon.
- Nicht alles wird pauschal 📦 angezeigt.
```

Bitte Regressionstest ergänzen.

---

### P0.4 Speichern darf keine Partialdaten erzeugen

Vorherige Beobachtung:

```text
„Speichern fehlgeschlagen“, aber nach Reload waren partiell/unvollständig Daten vorhanden.
```

Akzeptanz:

```text
Erfolg = vollständige Speicherung + keine Fehlermeldung.
Fehler = keine partiell geschriebenen kaputten Datensätze.
```

Bitte prüfen:

```text
- DB transaction
- API status codes
- client-side success/error state
- validation before insert/update
- rollback bei Folgefehlern
```

---

### P0.5 Löschen: Archivieren vs. Dauerhaft löschen

Gewünschte finale Semantik:

```text
Verbraucht = Bestand ausbuchen.
Archivieren = Artikel aus normalen Listen ausblenden, aber Historie behalten.
Dauerhaft löschen = Artikel und passende Testdaten wirklich entfernen.
```

Für Christophers Testphase ist **Dauerhaft löschen** wichtig, damit Testartikel die DB nicht zumüllen.

UI-Erwartung:

```text
Artikel-Aktion:
- Archivieren
- Dauerhaft löschen
```

Falls ein Artikel noch Bestand oder abhängige Relationen hat:

```text
- stoqr-konformes Modal anzeigen.
- Abhängigkeiten verständlich nennen.
- Option anbieten:
  - Abbrechen
  - Erst Bestand entfernen/verbrauchen
  - Dauerhaft löschen inklusive abhängiger Testdaten, sofern sicher möglich
```

Soft-deleted/archivierte Artikel dürfen in normalen UIs, Suchen und Easy-Add nicht mehr erscheinen, außer es gibt explizit einen Archiv-/Wiederherstellen-Bereich.

Akzeptanz:

```text
1. Testartikel STOQR_DELETE_TEST_001 anlegen.
2. Artikel archivieren.
3. UI reload.
4. Artikel nicht in normaler Liste/Suche/Easy-Add.
5. Optional im Archiv sichtbar.

6. Testartikel STOQR_DELETE_TEST_002 anlegen.
7. Dauerhaft löschen.
8. UI reload.
9. Artikel nicht in Liste.
10. Artikel nicht in Suche.
11. Artikel nicht in Easy-Add.
12. DB enthält ihn nicht mehr oder nur noch notwendige Audit-Spuren ohne normale Sichtbarkeit.
```

---

### P0.6 Kein natives JS Alert/Confirm

Keine nativen Browser-Alerts für Löschbestätigung.

Erwartung:

```text
Stoqr-konformes Confirm Modal.
Light/Dark Mode kompatibel.
```

Beispiel:

```text
Artikel dauerhaft löschen?

„Vollmilch Test“ wird dauerhaft gelöscht und erscheint nicht mehr in Suche, Inventar oder Easy-Add.

[Abbrechen] [Dauerhaft löschen]
```

---

### P0.7 Märkte / Stores und Bezugsquellen

Märkte/Bezugsquellen sind ab jetzt P0, weil sie für den geplanten Einkaufslisten-/Bring-Flow grundlegend sind und zuletzt im Test entweder 500 zeigten oder nicht sichtbar/nutzbar waren.

Letzter bekannter Nutzerstand:

```text
Einstellungen → Märkte zeigte 500 Internal Error.
Bezugsquellen waren nicht sichtbar/nutzbar.
```

Claudes Koordinator-Prompt sagt zwar, Märkte/Einkaufsquellen und Bezugsquellen mit sort_order seien bereits funktionierend. Das ist nicht durch Christophers letzten Test bestätigt.

Audit muss klären:

```text
- Ist der 500 behoben?
- Sind Märkte erreichbar?
- Kann man Märkte anlegen?
- Erscheinen Märkte ohne Reload?
- Kann man Adresse/Filiale pflegen?
- Sind Bezugsquellen am Artikel sichtbar?
- Kann man pro Artikel mehrere Märkte priorisieren?
```

Ziel Marktmodell:

```text
Konkrete Filialen unterscheidbar machen.
```

Beispiel:

```text
Penny Max-Planck-Straße 1, Hockenheim
Penny Ernst-Brauch-Straße 64-66, Hockenheim
Globus
```

Bezugsquellen-Ziel:

```text
Ein Artikel kann mehrere Bezugsquellen/Märkte haben.
Diese haben Priorität/Reihenfolge.
```

Beispiel:

```text
Milch:
1. Penny Max-Planck-Straße 1
2. Globus
```

Akzeptanz:

```text
- Einstellungen → Märkte öffnet ohne 500.
- Markt anlegen funktioniert.
- Markt erscheint ohne Reload.
- Filiale/Adresse sind unterscheidbar.
- Bereich „Bezugsquellen“ am Artikel sichtbar.
- Markt hinzufügen funktioniert.
- mehrere Märkte möglich.
- Reihenfolge änderbar.
- Reload erhält Reihenfolge.
```

---

## 10. P1-Themen

### P1.1 Buttons klarer und uniform

Problem:

```text
„+“ und „+ Bestand hinzufügen“ sind nicht eindeutig und nicht uniform.
```

Erwartung:

```text
Neuer Artikel
Bestand hinzufügen
```

oder:

```text
Lebensmittel anlegen
Bestand einlagern
```

Keine reine Plus-Schaltfläche für Kernaktionen.

---

### P1.2 Bestand hinzufügen direkt auf Artikelkarte

Ziel:

```text
Artikelkarte → Bestand hinzufügen
```

Dann ist Kontext klar:

```text
product_id = aktueller Artikel
Name/Kategorie/Standardwerte vorausgefüllt
```

---

### P1.3 3-Dot-Menüs / Overlay-Z-Index

Bekanntes Problem:

```text
3-Dot-Menüs schieben sich unter/zwischen Artikel-Cards.
```

Erwartung:

```text
Top-Layer Overlay, nicht durch Cards/Overflow abgeschnitten.
```

---

### P1.4 Mobile-first Responsive UI

Nicht final als erledigt markieren.

Bekannte Probleme:

```text
- horizontales Wischen
- seltsame Zeilenumbrüche
- fehlende Inhalte wie Dark Mode Toggle
- interne Scrollbars in Cards/Tabellen/Sections
- Zentrierung teilweise falsch
```

Viewport-Tests:

```text
320px
360px
390px
430px
768px
Desktop
```

---

## 11. P2-Themen

### P2.1 Nährwerte dynamisch + OCR

Bleibt P2, bis P0/P1 stabil sind.

Ziel:

```text
Nährwerttypen in Einstellungen.
Nährwertwerte individuell pro Artikel.
OCR für Nährwerttabellen mit editierbarer Voransicht.
```

### P2.2 Emoji-Picker weiter ausbauen

Bleibt P2:

```text
- viel mehr Emojis
- Tabs
- Pagination
- Suche über Schlagwörter
- keine Dubletten
```

### P2.3 Einkaufsliste / Bring!-Integration

Für Christophers Setup gilt: nicht als vollständig erledigt markieren, solange Christopher es nicht konkret getestet hat.

---

## 12. Künftiges Testprotokoll-Format

> **Verbindlich ab Baseline 2026-08-13:** Jeder Test-Manifest-Turn endet mit **genau einem Commit**, dessen
> CHANGELOG-Eintrag (a) was geplant war, (b) was umgesetzt wurde, (c) was nicht funktionierte / wo es Probleme gab
> (inkl. Testergebnis) festhält. Das ist der einzige Weg, wie das Testergebnis dauerhaft ins Repo wandert (bisher nur im
> localStorage des Testers). Siehe `docs/ROADMAP.md` → „Handover-Prozess pro Test-Turn".

Christopher-Rückmeldungen sollen künftig in dieses Format überführt werden:

```text
## Handover an Claude Code — stoqr [DATUM]

### Getesteter Stand
- Commit:
- Image-Tag:
- Image Digest / Created:
- Getestet auf:
- Browser:
- Viewport:
- Pi/Containerstatus:

### Testergebnis-Zusammenfassung
2–3 Sätze.

### Bestätigte Bugs / Regressionen

#### [P0/P1/P2] [Kurztitel]
- Testschritte:
- Erwartet:
- Tatsächlich:
- Fehlermeldung:
- Neu aufgetreten:
- War vorher:
- Relevante Logs/Screenshots:

### Was als nächstes zu tun ist
1. [P0] ...
2. [P0] ...
3. [P1] ...

### Anweisungen an Claude Code
- Eine fokussierte Änderung pro Commit.
- `npm run check`, Lint, Build vor Commit.
- Regressionen aktiv testen.
- Audit vor nächstem Änderungsblock.
- Migrationen/Breaking Changes explizit dokumentieren.
```

Vor jedem Handover an Claude Code sollen mindestens diese Infos abgefragt werden, wenn sie fehlen:

```text
1. Welches GHCR-Image bzw. welcher Commit wurde getestet?
2. Welche exakten Testschritte?
3. Erwartetes vs. tatsächliches Verhalten?
4. Gerät/Browser/Viewport?
5. Browser-Konsole oder docker logs?
6. Neue Regression?
```

Bei reinen Pi-/Backend-Tests reichen pragmatisch:

```text
Commit
Image Digest / Created
docker compose ps
docker logs
```

---

## 13. Erwartete Tests vor GHCR Publish

Bitte vor GHCR Publish echte Tests durchführen, nicht nur Build/CI.

Mindesttests:

```text
1. Neuer Artikel ohne MHD-Felder im Formular.
2. Artikel bearbeiten funktioniert.
3. Kategorie speichern funktioniert.
4. Kategorie ändern funktioniert.
5. Suche zeigt korrektes Kategorie-Emoji.
6. Easy-Add-Suche zeigt korrektes Kategorie-Emoji.
7. Löschen verwendet stoqr Modal, kein JS Alert.
8. Archivierter Artikel verschwindet aus normalen Suchen.
9. Dauerhaft gelöschter Artikel verschwindet aus Suche.
10. Kein „Speichern fehlgeschlagen“, wenn Daten geschrieben werden.
11. Keine partiellen kaputten Datensätze bei Fehlern.
12. Einstellungen → Märkte öffnet ohne 500.
13. Markt anlegen erscheint ohne Reload.
14. Bezugsquellen pro Artikel sichtbar und priorisierbar.
15. 3-Dot-Menü liegt korrekt über Cards.
```

Regressionen:

```text
- Login Christopher
- Top Nav ohne Reload
- Direkt /orte
- Einstellungen → Mitglieder
- Einstellungen → Einheiten
- Dark Mode blau/lila
- Light Mode okay
- Unit-Löschschutz
- /einkaufsliste erreichbar
- Healthcheck grün
```

Nach erfolgreicher Umsetzung:

```text
GHCR ghcr.io/labushuya/stoqr:main neu publishen.
Falls Migrationen nötig sind, müssen sie automatisch beim Containerstart laufen.
```

---

## 14. hubctl

hubctl ist wichtig, aber **nicht Teil dieses akuten stoqr-App-Fixblocks**.

Status:

```text
hubctl wird später separat behandelt.
Nicht jetzt in denselben Claude-Code-Kontext mischen.
```

Später relevante hubctl-Themen:

```text
- stoqr Update-Flow
- GHCR Pull
- Compose Template Sync
- Healthcheck
- Backup
- Restore-Hinweis
- Seed/Onboarding Checks
- Logs/Smoke-Test
```

Für jetzt gilt:

```text
App-P0/P1 zuerst stabilisieren.
hubctl später als eigener Arbeitsblock.
```