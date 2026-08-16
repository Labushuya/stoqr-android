import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

// ---------------------------------------------------------------------------
// Dual-Target-Adapter
// ---------------------------------------------------------------------------
// STOQR_TARGET=node (Default, Pi): adapter-node, SSR - unveraendert.
// STOQR_TARGET=app (Android): adapter-static als SPA (fallback index.html,
// kein SSR/Prerender) - die Capacitor-WebView laedt das statische Bundle,
// Daten kommen aus On-Device-SQLite ueber die entkoppelten Query-Funktionen.
const target = process.env.STOQR_TARGET ?? 'node'

const adapter =
  target === 'app'
    ? (await import('@sveltejs/adapter-static')).default({
        fallback: 'index.html',
        pages: 'build',
        assets: 'build',
        precompress: false,
        strict: false,
      })
    : (await import('@sveltejs/adapter-node')).default({
        out: 'build',
      })

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter,
    // Im App-Target: kein SSR, ganze App als SPA prerender-frei ausliefern.
    ...(target === 'app' && {
      prerender: { entries: [] },
    }),
    alias: {
      $lib: './src/lib',
      $components: './src/lib/components',
      $data: './src/lib/data',
      $db: '../../packages/db/src',
    },
  },
}

export default config
