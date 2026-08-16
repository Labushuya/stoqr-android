<script lang="ts">
  import type { GeoSuggestion } from '$lib/utils/geo'
  import { formatStreet } from '$lib/utils/geo'
  import { apiFetch } from '$lib/client/api'

  interface Props {
    // Aktueller Adress-Text (Straße + Hausnummer); bind:value vom Parent.
    value: string
    placeholder?: string
    ariaLabel?: string
    // Wird beim Auswählen eines Vorschlags aufgerufen (Parent füllt Stadt/Koordinaten).
    onselect?: (s: GeoSuggestion) => void
  }

  let { value = $bindable(''), placeholder = 'Adresse suchen…', ariaLabel = 'Adresse', onselect }: Props =
    $props()

  let suggestions = $state<GeoSuggestion[]>([])
  let open = $state(false)
  let loading = $state(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  async function runSearch(q: string) {
    loading = true
    try {
      const res = await apiFetch(`/api/geo/search?q=${encodeURIComponent(q)}`)
      const b = await res.json().catch(() => ({ results: [] }))
      suggestions = Array.isArray(b?.results) ? (b.results as GeoSuggestion[]) : []
      open = suggestions.length > 0
    } catch {
      suggestions = []
      open = false
    } finally {
      loading = false
    }
  }

  function onInput() {
    if (debounceTimer) clearTimeout(debounceTimer)
    const q = value.trim()
    if (q.length < 3) {
      suggestions = []
      open = false
      return
    }
    // Debounce >= 450ms (Nominatim-Höflichkeit + weniger Requests).
    debounceTimer = setTimeout(() => runSearch(q), 500)
  }

  function pick(s: GeoSuggestion) {
    const street = formatStreet(s)
    value = street || s.displayName
    open = false
    suggestions = []
    onselect?.(s)
  }
</script>

<div class="addr-autocomplete">
  <span class="addr-icon" aria-hidden="true">
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
      <path d="M8 1.5c-2.5 0-4.5 2-4.5 4.5 0 3.2 4.5 8 4.5 8s4.5-4.8 4.5-8c0-2.5-2-4.5-4.5-4.5Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      <circle cx="8" cy="6" r="1.6" stroke="currentColor" stroke-width="1.3"/>
    </svg>
  </span>
  <input
    class="input addr-input"
    type="text"
    bind:value
    {placeholder}
    aria-label={ariaLabel}
    autocomplete="off"
    oninput={onInput}
    onfocus={() => { if (suggestions.length) open = true }}
    onblur={() => setTimeout(() => (open = false), 150)}
  />
  {#if loading}<span class="addr-hint">suche…</span>{/if}
  {#if open && suggestions.length}
    <ul class="addr-list" role="listbox">
      {#each suggestions as s (s.displayName)}
        <li>
          <!-- onpointerdown feuert vor blur → verhindert, dass die Auswahl verpufft -->
          <button
            type="button"
            class="addr-item"
            onpointerdown={(e) => { e.preventDefault(); pick(s) }}
          >
            {s.displayName}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .addr-autocomplete { position: relative; flex: 1 1 100%; }
  /* Feld-Styling identisch zu den .input-Feldern der Seiten (scoped styles greifen
     hier nicht), plus Platz links fuer das Adress-Icon. */
  .addr-autocomplete .addr-input {
    width: 100%;
    box-sizing: border-box;
    height: 40px;
    padding: 0 var(--space-3) 0 32px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    appearance: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }
  .addr-autocomplete .addr-input::placeholder { color: var(--color-text-muted); }
  .addr-autocomplete .addr-input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }
  .addr-icon {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    color: var(--color-text-muted); pointer-events: none; display: inline-flex;
  }
  .addr-hint { position: absolute; right: var(--space-2); top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--color-text-muted); }
  .addr-list {
    position: absolute; z-index: 40; top: calc(100% + 2px); left: 0; right: 0;
    margin: 0; padding: var(--space-1); list-style: none;
    background: var(--color-surface-raised); border: 1px solid var(--color-border);
    border-radius: var(--radius-md); box-shadow: var(--shadow-lg);
    max-height: 260px; overflow-y: auto;
  }
  .addr-item {
    display: block; width: 100%; text-align: left; padding: var(--space-2) var(--space-3);
    border: none; background: transparent; color: var(--color-text-primary);
    font-size: var(--text-sm); cursor: pointer; border-radius: var(--radius-sm);
  }
  .addr-item:hover { background: var(--color-primary-subtle); }
</style>
