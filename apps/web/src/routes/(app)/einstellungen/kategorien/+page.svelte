<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { toast } from '$lib/stores/toast'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import EmojiPicker from '$lib/components/EmojiPicker.svelte'
  import { buildCategoryTree, isDescendant, type CatNode } from '$lib/utils/category-tree'

  let { data }: { data: PageData } = $props()

  type Category = {
    id: string
    parentId: string | null
    name: string
    slug: string
    icon: string | null
    defaultExpiryToleranceDays: number
    sortOrder: number
  }

  // Liste als lokaler $state (nach Mutation aus der fetch-Antwort patchen — nicht
  // aus $derived reseeden).
  // svelte-ignore state_referenced_locally
  let rows = $state<Category[]>(data.categories as Category[])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)

  // Die 9 Basis-Kategorien (Seed) sind loeschgeschuetzt.
  const SEED_SLUGS = new Set([
    'fruits-vegetables', 'dairy', 'meat-fish', 'bakery', 'canned-frozen',
    'beverages', 'snacks', 'condiments', 'other',
  ])
  const isSeed = (c: Category) => SEED_SLUGS.has(c.slug)

  // Baum-Reihenfolge (DFS) mit Tiefe je Zeile — Anzeige eingerueckt (G27).
  const asNodes = (list: Category[]): CatNode[] =>
    list.map((c) => ({ id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, sortOrder: c.sortOrder }))
  const tree = $derived(buildCategoryTree(asNodes(rows)))
  // Karte id → Category fuer schnellen Zugriff in der Baum-Zeile.
  const byId = $derived(new Map(rows.map((c) => [c.id, c])))

  // Sichtbare Einrueckung fuer <option>-Labels: HTML kollabiert fuehrende
  // Leerzeichen in <option>, daher Non-Breaking-Spaces (G27-2).
  const NBSP = String.fromCharCode(160)
  const optionIndent = (depth: number) => (depth > 0 ? NBSP.repeat(depth * 4) : '')

  // Eltern-Optionen fuer ein Formular: alle Kategorien als Baum; beim Bearbeiten
  // die Kategorie selbst + ihre Nachkommen ausschliessen (Client-Zyklus-Schutz).
  function parentOptions(excludeId: string | null) {
    return tree.filter((n) => !excludeId || !isDescendant(asNodes(rows), n.id, excludeId))
  }

  // ── Add form ──────────────────────────────────────────────────────────────
  let newName = $state('')
  let newIcon = $state('')
  let newParentId = $state('')
  let adding = $state(false)
  let addError = $state<string | null>(null)

  // ── Inline edit ─────────────────────────────────────────────────────────
  let editingId = $state<string | null>(null)
  let editName = $state('')
  let editIcon = $state('')
  let editParentId = $state('')
  let editSaving = $state(false)
  let rowErrors = $state<Record<string, string>>({})

  // ── Delete ────────────────────────────────────────────────────────────────
  let deleting = $state<string | null>(null)
  let confirmModal = $state<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)
  function showConfirm(title: string, message: string, onConfirm: () => void) {
    confirmModal = { open: true, title, message, onConfirm }
  }
  function closeConfirm() { confirmModal = null }

  // ── Emoji-Picker (Icon-Auswahl per Modal, G25) ─────────────────────────────
  // target = 'add' → schreibt newIcon; target = 'edit' → schreibt editIcon.
  let emojiPickerFor = $state<'add' | 'edit' | null>(null)
  function pickEmoji(emoji: string) {
    if (emojiPickerFor === 'add') newIcon = emoji
    else if (emojiPickerFor === 'edit') editIcon = emoji
  }

  function startEdit(c: Category) {
    editingId = c.id
    editName = c.name
    editIcon = c.icon ?? ''
    editParentId = c.parentId ?? ''
    rowErrors = { ...rowErrors, [c.id]: '' }
  }
  function cancelEdit() { editingId = null }

  async function saveEdit(id: string) {
    const name = editName.trim()
    if (!name) { rowErrors = { ...rowErrors, [id]: 'Name erforderlich.' }; return }
    editSaving = true
    rowErrors = { ...rowErrors, [id]: '' }
    try {
      const res = await apiFetch(`/api/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon: editIcon.trim() || null, parentId: editParentId || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { rowErrors = { ...rowErrors, [id]: body.error ?? `Fehler ${res.status}` }; return }
      rows = rows.map((c) => (c.id === id ? (body as Category) : c))
      editingId = null
    } catch {
      rowErrors = { ...rowErrors, [id]: 'Netzwerkfehler.' }
    } finally {
      editSaving = false
    }
  }

  async function addCategory() {
    const name = newName.trim()
    if (!name) { addError = 'Name erforderlich.'; return }
    adding = true
    addError = null
    try {
      const res = await apiFetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon: newIcon.trim() || null, parentId: newParentId || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { addError = body.error ?? `Fehler ${res.status}`; return }
      rows = [...rows, body as Category]
      newName = ''
      newIcon = ''
      newParentId = ''
      toast.success('Kategorie angelegt')
    } catch {
      addError = 'Netzwerkfehler.'
    } finally {
      adding = false
    }
  }

  function requestDelete(c: Category) {
    showConfirm('Kategorie löschen', `„${c.name}" löschen?`, () => {
      closeConfirm()
      performDelete(c.id)
    })
  }

  async function performDelete(id: string) {
    deleting = id
    try {
      const res = await apiFetch(`/api/categories/${id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? 'Kategorie wird noch verwendet.'))
        return
      }
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? `Fehler ${res.status}`))
        return
      }
      rows = rows.filter((c) => c.id !== id)
      toast.success('Kategorie gelöscht')
    } catch {
      toast.error('Netzwerkfehler beim Löschen.')
    } finally {
      deleting = null
    }
  }
</script>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einstellungen" class="breadcrumb-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einstellungen
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current" aria-current="page">Kategorien</span>
  </nav>

  <header class="page-header">
    <h1 class="page-title">Kategorien</h1>
    <p class="page-desc">
      Verwalte die Kategorien deiner Artikel. Die neun Basis-Kategorien lassen sich umbenennen, aber
      nicht löschen. Kategorien mit zugeordneten Artikeln können nicht gelöscht werden.
      Kategorien sind haushaltsübergreifend gemeinsam.
    </p>
  </header>

  {#if pageLoadError}
    <div class="alert alert--error" role="alert" style="margin-bottom: var(--space-6);">{pageLoadError}</div>
  {/if}

  <!-- ── Liste ────────────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header"><h2 class="section-title">Meine Kategorien</h2></div>

    <div class="cat-list" role="list">
      {#each tree as node (node.id)}
        {@const cat = byId.get(node.id)}
        {#if cat}
        <div class="cat-row" role="listitem" style="padding-left: calc(var(--space-4) + {node.depth} * var(--space-5));">
          {#if editingId === cat.id}
            <div class="cat-edit">
              <div class="edit-fields">
                <button class="icon-btn" type="button" onclick={() => (emojiPickerFor = 'edit')} aria-label="Icon wählen" title="Icon wählen">{editIcon || '🏷️'}</button>
                <input class="input" type="text" bind:value={editName} placeholder="Name" maxlength="128" aria-label="Name" />
              </div>
              <label class="parent-field">
                <span class="parent-label">Unterkategorie von</span>
                <select class="input" bind:value={editParentId} aria-label="Unterkategorie von">
                  <option value="">— keine (Oberkategorie) —</option>
                  {#each parentOptions(cat.id) as opt (opt.id)}
                    <option value={opt.id}>{optionIndent(opt.depth)}{opt.icon ? opt.icon + ' ' : ''}{opt.name}</option>
                  {/each}
                </select>
              </label>
              {#if rowErrors[cat.id]}<p class="field-error">{rowErrors[cat.id]}</p>{/if}
              <div class="edit-actions">
                <button class="btn-save-inline" type="button" disabled={editSaving} onclick={() => saveEdit(cat.id)}>Speichern</button>
                <button class="btn-cancel-inline" type="button" onclick={cancelEdit}>Abbrechen</button>
                {#if !isSeed(cat)}
                  <button class="btn-delete-inline" type="button" disabled={deleting === cat.id} onclick={() => requestDelete(cat)}>Löschen</button>
                {/if}
              </div>
            </div>
          {:else}
            <div class="cat-info">
              {#if node.depth > 0}<span class="cat-sub" aria-hidden="true" title="Unterkategorie">↳</span>{/if}
              <span class="cat-icon" aria-hidden="true">{cat.icon || '🏷️'}</span>
              <span class="cat-name">{cat.name}</span>
              {#if isSeed(cat)}<span class="system-badge">Basis</span>{/if}
            </div>
            <div class="cat-actions">
              <button class="btn-edit-inline" type="button" onclick={() => startEdit(cat)}>Bearbeiten</button>
              {#if !isSeed(cat)}
                <button class="btn-delete-inline" type="button" disabled={deleting === cat.id} onclick={() => requestDelete(cat)}>Löschen</button>
              {/if}
            </div>
          {/if}
        </div>
        {/if}
      {/each}
    </div>
  </section>

  <!-- ── Neue Kategorie ───────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header"><h2 class="section-title">Neue Kategorie anlegen</h2></div>
    {#if addError}<div class="alert alert--error" role="alert">{addError}</div>{/if}
    <div class="add-form">
      <div class="add-fields">
        <button class="icon-btn" type="button" onclick={() => (emojiPickerFor = 'add')} aria-label="Icon wählen" title="Icon wählen">{newIcon || '🏷️'}</button>
        <input class="input" type="text" bind:value={newName} placeholder="Name — z.B. Tiefkühlkost" maxlength="128" aria-label="Name" />
      </div>
      <label class="parent-field">
        <span class="parent-label">Unterkategorie von (optional)</span>
        <select class="input" bind:value={newParentId} aria-label="Unterkategorie von">
          <option value="">— keine (Oberkategorie) —</option>
          {#each parentOptions(null) as opt (opt.id)}
            <option value={opt.id}>{optionIndent(opt.depth)}{opt.icon ? opt.icon + ' ' : ''}{opt.name}</option>
          {/each}
        </select>
      </label>
      <div class="add-footer">
        <button class="btn-primary" type="button" disabled={adding} onclick={addCategory}>Anlegen</button>
      </div>
    </div>
  </section>
</div>

<EmojiPicker
  open={emojiPickerFor !== null}
  current={emojiPickerFor === 'add' ? (newIcon || null) : (editIcon || null)}
  onPick={pickEmoji}
  onClose={() => (emojiPickerFor = null)}
/>

{#if confirmModal}
  <ConfirmModal
    open={confirmModal.open}
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel="Löschen"
    destructive={true}
    onConfirm={confirmModal.onConfirm}
    onCancel={closeConfirm}
  />
{/if}

<style>
  .page { max-width: 760px; margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-16); }

  .breadcrumb { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-6); font-size: var(--text-sm); color: var(--color-text-muted); }
  .breadcrumb-back { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-primary); text-decoration: none; font-weight: 500; }
  .breadcrumb-back:hover { color: var(--color-primary-hover); }
  .breadcrumb-sep { color: var(--color-text-muted); }
  .breadcrumb-current { color: var(--color-text-secondary); font-weight: 500; }

  .page-header { margin-bottom: var(--space-8); }
  .page-title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); letter-spacing: -0.02em; margin: 0 0 var(--space-2); }
  .page-desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; line-height: 1.6; }

  .settings-section { background-color: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: var(--space-6); margin-bottom: var(--space-6); box-shadow: var(--shadow-sm); }
  .section-header { margin-bottom: var(--space-5); }
  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); margin: 0; }

  .cat-list { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
  .cat-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border-subtle); background-color: var(--color-surface); min-height: 52px; }
  .cat-row:last-child { border-bottom: none; }
  .cat-info { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; }
  .cat-sub { color: var(--color-text-muted); font-size: var(--text-sm); }
  .cat-icon { font-size: var(--text-lg); line-height: 1; }
  .cat-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .system-badge { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-full); background: var(--color-surface-sunken); color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
  .cat-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }

  .cat-edit { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }
  .edit-fields, .add-fields { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .edit-actions { display: flex; gap: var(--space-2); }
  .field-error { font-size: var(--text-xs); color: var(--color-danger, #dc2626); margin: 0; }

  .add-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .parent-field { display: flex; flex-direction: column; gap: var(--space-1); }
  .parent-label { font-size: var(--text-xs); color: var(--color-text-muted); }
  /* Im Spalten-Flex wuerde flex-basis:200px der .input zur HOEHE → Select fixieren. */
  .parent-field .input { flex: 0 0 auto; height: 40px; }
  .add-footer { display: flex; }

  .input { flex: 1 1 200px; min-width: 0; }
  .icon-btn { flex: 0 0 auto; width: 48px; height: 40px; display: inline-flex; align-items: center; justify-content: center; font-size: 22px; line-height: 1; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); cursor: pointer; }
  .icon-btn:hover { border-color: var(--color-primary); background: var(--color-primary-subtle); }

  .alert { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 500; margin-bottom: var(--space-4); }
  .alert--error { background-color: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); border: 1px solid rgba(220, 38, 38, 0.2); }

  @media (max-width: 560px) {
    .page { padding: var(--space-5) var(--space-3) var(--space-12); }
    .settings-section { padding: var(--space-4); }
    .edit-fields .input, .add-fields .input { flex-basis: 100%; }
    .cat-row { flex-direction: column; align-items: flex-start; }
    .cat-actions { width: 100%; justify-content: flex-end; }
  }
</style>
