import js from '@eslint/js'
import ts from 'typescript-eslint'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'

export default [
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
    rules: {
      // Svelte 5: $state(prop.x) captures once intentionally (server-data → local state pattern)
      'svelte/reactivity': 'off',
      'svelte/no-reactive-reassign': 'off',
      // autofocus is acceptable for modals/dialogs in this app
      'svelte/no-dom-manipulating': 'off',
      'jsx-a11y/no-autofocus': 'off',
      // Dialog backdrop overlays legitimately use click handlers on non-interactive divs
      'svelte/no-unused-svelte-ignore': 'warn',
    },
  },
  {
    rules: {
      // Allow explicit any in server queries where drizzle types are complex
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['**/build/**', '**/.svelte-kit/**', '**/dist/**', 'node_modules/**'],
  },
]
