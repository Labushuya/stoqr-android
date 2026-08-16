<script lang="ts">
  import Modal from './Modal.svelte'
  import { filterEmojis, emojisByContext } from '$lib/data/category-emojis'

  let {
    open = false,
    current = null,
    context = 'category',
    onPick,
    onClose,
  }: {
    open: boolean
    current?: string | null
    context?: 'category' | 'place'
    onPick: (emoji: string) => void
    onClose: () => void
  } = $props()

  let query = $state('')
  // Ohne Suche: kontextpassende Vorsortierung (Lebensmittel bzw. Raeume zuerst).
  // Sobald gesucht wird: ueber ALLE Gruppen filtern.
  const results = $derived(query.trim() ? filterEmojis(query) : emojisByContext(context))

  function pick(emoji: string) {
    onPick(emoji)
    query = ''
    onClose()
  }
</script>

<Modal {open} title="Icon wählen" size="md" {onClose}>
  <input
    class="emoji-search"
    type="text"
    bind:value={query}
    placeholder="Suchen — z.B. tiefkühl, käse, wasser, putzen"
    aria-label="Emoji suchen"
  />
  {#if results.length === 0}
    <p class="emoji-empty">Kein Treffer für „{query}".</p>
  {:else}
    <div class="emoji-grid">
      {#each results as e (e.emoji)}
        <button
          class="emoji-cell"
          class:emoji-cell--current={e.emoji === current}
          type="button"
          title={e.keywords[0]}
          onclick={() => pick(e.emoji)}
        >{e.emoji}</button>
      {/each}
    </div>
  {/if}
  {#snippet footer()}
    <button class="btn-cancel-inline" type="button" onclick={onClose}>Abbrechen</button>
  {/snippet}
</Modal>

<style>
  .emoji-search {
    width: 100%; height: 40px; padding: 0 var(--space-3); box-sizing: border-box;
    border-radius: var(--radius-md); border: 1px solid var(--color-border);
    background: var(--color-surface); color: var(--color-text-primary);
    font-size: var(--text-base); outline: none; margin-bottom: var(--space-4);
  }
  .emoji-search:focus { border-color: var(--color-border-focus); box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15); }
  .emoji-grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: var(--space-2); max-height: 320px; overflow-y: auto;
  }
  .emoji-cell {
    display: flex; align-items: center; justify-content: center;
    height: 44px; font-size: 24px; line-height: 1;
    border: 1px solid var(--color-border); border-radius: var(--radius-md);
    background: var(--color-surface); cursor: pointer;
  }
  .emoji-cell:hover { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .emoji-cell--current { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .emoji-empty { font-size: var(--text-sm); color: var(--color-text-muted); margin: var(--space-2) 0; }
</style>
