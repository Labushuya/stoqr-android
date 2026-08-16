// ---------------------------------------------------------------------------
// build-app.mjs — App-Target-Build-Wrapper (Capacitor SPA)
// ---------------------------------------------------------------------------
// Problem: Im App-Target (adapter-static, fallback: index.html) gibt es keine
// Server-Data-JSON. Solange die +*.server.ts zur `svelte-kit sync`-Zeit im
// Routen-Baum liegen, kodiert SvelteKit jede Route als server-load-behaftet und
// der Client fetcht bei jeder Navigation `/<route>/__data.json` -> 404 ->
// "Unexpected end of JSON input" -> Seite bleibt blank.
//
// Loesung: die +*.server.ts VOR dem App-Build voruebergehend aus src/routes in
// einen Stash verschieben (kein Delete), bauen, danach IMMER wiederherstellen.
// Der Pi-Build (STOQR_TARGET=node) laeuft ueber `vite build` direkt und bleibt
// unberuehrt — er BRAUCHT die Server-Nodes (SSR/Postgres).
//
// Restore ist garantiert: try/finally + Signal-Handler + idempotent (es wird nur
// zurueckgelegt, was noch im Stash liegt). Die 18 universellen +page.ts /
// +layout.ts liefern die Daten im App-Target ohnehin selbst.

import { spawnSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const webRoot = resolve(__dirname, '..')
const routesDir = join(webRoot, 'src', 'routes')
const stashDir = join(webRoot, '.svelte-kit', '.server-nodes-stash')

// --- alle +*.server.ts unter src/routes rekursiv finden ---------------------
function findServerNodes(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...findServerNodes(full))
    } else if (/^\+.*\.server\.ts$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

// relative Pfade (ggue. routesDir) der gestashten Nodes — treibt den Restore.
let stashed = []

function stashServerNodes() {
  const nodes = findServerNodes(routesDir)
  // Stash NICHT vorab platt machen: liegt hier noch etwas aus einem frueheren,
  // unvollstaendig wiederhergestellten Lauf, wuerde rmSync es unwiederbringlich
  // loeschen. Erst restoreServerNodes() aufraeumen lassen (loescht nur nach
  // vollstaendigem Restore).
  restoreServerNodes()
  for (const abs of nodes) {
    const rel = relative(routesDir, abs)
    const dest = join(stashDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    // WICHTIG: rel VOR dem Move vormerken. Faengt ein Signal/synchroner Throw
    // (z.B. Windows EPERM) zwischen rename und push, ist die Datei bereits im
    // Stash — nur wenn rel in `stashed` steht, holt der Restore sie zurueck.
    stashed.push(rel)
    renameSync(abs, dest)
  }
  console.log(`[build-app] ${stashed.length} +*.server.ts weggestasht`)
}

function restoreServerNodes() {
  if (!stashed.length) return
  let restored = 0
  let allBack = true
  for (const rel of stashed) {
    const src = join(stashDir, rel)
    const dest = join(routesDir, rel)
    if (existsSync(dest)) {
      restored++
      continue // schon zurueck (doppelter Aufruf) -> zaehlt als wiederhergestellt
    }
    if (!existsSync(src)) {
      // Weder am Ziel noch im Stash — Datei ist verschollen. NICHT den Stash
      // loeschen, damit ein manueller Recovery-Versuch moeglich bleibt.
      allBack = false
      continue
    }
    mkdirSync(dirname(dest), { recursive: true })
    try {
      renameSync(src, dest)
      restored++
    } catch (err) {
      if (err?.code === 'EXDEV') {
        // Nur echter Cross-Device-Fall: kopieren statt verschieben.
        cpSync(src, dest)
        rmSync(src, { force: true })
        restored++
      } else {
        // Anderer Fehler (Windows EPERM/EBUSY o.ae.): Datei im Stash lassen,
        // NICHT als wiederhergestellt zaehlen, Stash-Cleanup unterdruecken.
        console.error(`[build-app] Restore von ${rel} fehlgeschlagen: ${err?.message ?? err}`)
        allBack = false
      }
    }
  }
  console.log(`[build-app] ${restored}/${stashed.length} +*.server.ts wiederhergestellt`)
  // Stash NUR platt machen, wenn wirklich alles zurueck ist — sonst bleiben die
  // Dateien fuer einen naechsten Restore-Versuch erhalten (kein Datenverlust).
  if (allBack) {
    stashed = []
    rmSync(stashDir, { recursive: true, force: true })
  }
}

// Restore auch bei Abbruch/Crash — nicht nur im finally. Ein `handling`-Guard
// verhindert Re-Entry (Signal waehrend Restore -> Restore wirft -> uncaught).
let handling = false
function handleAndExit(code, err) {
  if (handling) return
  handling = true
  try {
    restoreServerNodes()
  } catch (e) {
    console.error(`[build-app] Restore im Abbruch-Handler fehlgeschlagen: ${e?.message ?? e}`)
  }
  if (err) console.error(err)
  process.exit(code)
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => handleAndExit(1))
}
process.on('uncaughtException', (err) => handleAndExit(1, err))

// --- Build --------------------------------------------------------------------
let code = 1
try {
  stashServerNodes()
  const res = spawnSync('vite', ['build'], {
    cwd: webRoot,
    stdio: 'inherit',
    env: { ...process.env, STOQR_TARGET: 'app' },
    shell: true, // Windows: vite.cmd via PATH aufloesen
  })
  code = res.status ?? 1
} finally {
  restoreServerNodes()
}

process.exit(code)
