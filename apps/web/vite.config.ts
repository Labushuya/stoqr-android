import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

// Build-Target (node=Pi, app=Android) fuer den Client sichtbar machen, damit
// der apiFetch-Shim den ungenutzten Pfad per Dead-Code-Elimination entfernt.
const target = process.env.STOQR_TARGET ?? 'node'

// App-Version aus der package.json (build-time), damit die Versions-Pill im
// App-Target die echte Release-Version zeigt statt eines hart codierten Werts.
const pkgVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
).version as string

// App-Target: '@stoqr/db/client' auf den Browser-Stub umbiegen, damit der
// native Postgres-Treiber (perf_hooks etc.) NICHT in den SPA-Bundle wandert.
// Zusaetzlich 'postgres' selbst stubben — adapter-static faehrt auch einen
// SSR-Shell-Pass, der einen etwaigen transitiven Import sonst doch aufloest.
// Auf dem Pi-Target bleibt alles echt (kein Alias).
const appAliases: Record<string, string> =
  target === 'app'
    ? {
        '@stoqr/db/client': fileURLToPath(
          new URL('../../packages/db/src/client.stub.ts', import.meta.url),
        ),
        postgres: fileURLToPath(
          new URL('../../packages/db/src/postgres.stub.ts', import.meta.url),
        ),
      }
    : {}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  define: {
    __STOQR_TARGET__: JSON.stringify(target),
    __STOQR_VERSION__: JSON.stringify(pkgVersion),
  },
  resolve: {
    alias: appAliases,
  },
  ssr: {
    noExternal: ['@stoqr/db'],
  },
})
