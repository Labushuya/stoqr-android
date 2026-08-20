import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      // SvelteKit-Aliase, damit Tests die ECHTEN $data/$lib-Module laden koennen
      // (vitest kennt die .svelte-kit/tsconfig-Pfade nicht von selbst).
      $data: fileURLToPath(new URL('./src/lib/data', import.meta.url)),
      $lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
      $components: fileURLToPath(new URL('./src/lib/components', import.meta.url)),
    },
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'node',
    passWithNoTests: true,
  },
})
