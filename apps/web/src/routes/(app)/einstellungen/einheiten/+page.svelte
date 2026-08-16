<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { toast } from '$lib/stores/toast'
  import Modal from '$lib/components/Modal.svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'

  let { data }: { data: PageData } = $props()

  type Dimension = 'mass' | 'volume' | 'count'
  type Unit = {
    id: string
    name: string
    symbol: string
    dimension: Dimension
    toBaseFactor: string
    isSystem: boolean
    householdId: string | null
    sortOrder: number | null
  }

  // svelte-ignore state_referenced_locally
  let unitRows = $state<Unit[]>(data.units as Unit[])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)

  const DIM_LABEL: Record<Dimension, string> = { mass: 'Masse', volume: 'Volumen', count: 'Stückzahl' }

  const existingSymbols = $derived(new Set(unitRows.map((u) => u.symbol)))
  // ── Add form ────────────────────────────────────────────────────────────
  let newName = $state('')
  let newSymbol = $state('')
  let newDimension = $state<Dimension>('count')
  let newFactor = $state('1')
  let adding = $state(false)
  let addError = $state<string | null>(null)

  // ── Inline edit ───────────────────────────────────────────────────────────
  let editingId = $state<string | null>(null)
  let editName = $state('')
  let editSymbol = $state('')
  let editDimension = $state<Dimension>('count')
  let editFactor = $state('1')
  let editSaving = $state(false)
  let rowErrors = $state<Record<string, string>>({})

  // ── Delete ────────────────────────────────────────────────────────────────
  let deleting = $state<string | null>(null)
  let confirmModal = $state<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)
  function showConfirm(title: string, message: string, onConfirm: () => void) {
    confirmModal = { open: true, title, message, onConfirm }
  }
  function closeConfirm() { confirmModal = null }

  // ── Suggestions modal ───────────────────────────────────────────────────
  let showSuggestions = $state(false)

  type Suggestion = { name: string; symbol: string; dimension: Dimension; toBaseFactor: number }
  const SUGGESTIONS: Suggestion[] = [
    // Masse
    { name: 'Milligramm', symbol: 'mg', dimension: 'mass', toBaseFactor: 0.001 },
    { name: 'Dekagramm', symbol: 'dag', dimension: 'mass', toBaseFactor: 10 },
    { name: 'Pfund', symbol: 'Pfd', dimension: 'mass', toBaseFactor: 500 },
    { name: 'Prise', symbol: 'Prise', dimension: 'mass', toBaseFactor: 0.5 },
    { name: 'Messerspitze', symbol: 'Msp', dimension: 'mass', toBaseFactor: 0.5 },
    // Volumen
    { name: 'Zentiliter', symbol: 'cl', dimension: 'volume', toBaseFactor: 10 },
    { name: 'Deziliter', symbol: 'dl', dimension: 'volume', toBaseFactor: 100 },
    { name: 'Esslöffel', symbol: 'EL', dimension: 'volume', toBaseFactor: 15 },
    { name: 'Teelöffel', symbol: 'TL', dimension: 'volume', toBaseFactor: 5 },
    { name: 'Tasse', symbol: 'Tasse', dimension: 'volume', toBaseFactor: 250 },
    { name: 'Schuss', symbol: 'Schuss', dimension: 'volume', toBaseFactor: 10 },
    { name: 'Tropfen', symbol: 'Trpf', dimension: 'volume', toBaseFactor: 0.05 },
    // Stückzahl / Gebinde
    { name: 'Bund', symbol: 'Bund', dimension: 'count', toBaseFactor: 1 },
    { name: 'Beutel', symbol: 'Beutel', dimension: 'count', toBaseFactor: 1 },
    { name: 'Glas', symbol: 'Glas', dimension: 'count', toBaseFactor: 1 },
    { name: 'Rolle', symbol: 'Rolle', dimension: 'count', toBaseFactor: 1 },
    { name: 'Becher', symbol: 'Becher', dimension: 'count', toBaseFactor: 1 },
    { name: 'Portion', symbol: 'Port', dimension: 'count', toBaseFactor: 1 },
    { name: 'Scheibe', symbol: 'Scheib', dimension: 'count', toBaseFactor: 1 },
    { name: 'Riegel', symbol: 'Riegel', dimension: 'count', toBaseFactor: 1 },
    { name: 'Tafel', symbol: 'Tafel', dimension: 'count', toBaseFactor: 1 },
    { name: 'Tube', symbol: 'Tube', dimension: 'count', toBaseFactor: 1 },
    { name: 'Kanister', symbol: 'Kanist', dimension: 'count', toBaseFactor: 1 },
    { name: 'Sack', symbol: 'Sack', dimension: 'count', toBaseFactor: 1 },
    { name: 'Karton', symbol: 'Karton', dimension: 'count', toBaseFactor: 1 },
    { name: 'Netz', symbol: 'Netz', dimension: 'count', toBaseFactor: 1 },
    { name: 'Kiste', symbol: 'Kiste', dimension: 'count', toBaseFactor: 1 },
    { name: 'Bündel', symbol: 'Bündel', dimension: 'count', toBaseFactor: 1 },
    { name: 'Paar', symbol: 'Paar', dimension: 'count', toBaseFactor: 1 },
  ]

  // Vorschläge, die noch nicht als Einheit existieren.
  const availableSuggestions = $derived(SUGGESTIONS.filter((s) => !existingSymbols.has(s.symbol)))

  // ── Helpers ────────────────────────────────────────────────────────────
  function factorDisplay(u: Unit): string {
    // Stückzahl-Einheiten (Flasche, Packung, …) sind nicht global umrechenbar —
    // die konkrete Größe wird pro Artikel als Gebinde hinterlegt (Einheiten v2).
    if (u.dimension === 'count') return 'Größe je Artikel (Gebinde)'
    const base = u.dimension === 'mass' ? 'g' : 'ml'
    return `1 ${u.symbol} = ${Number(u.toBaseFactor).toLocaleString('de-DE', { maximumFractionDigits: 4 })} ${base}`
  }

  function startEdit(u: Unit) {
    editingId = u.id
    editName = u.name
    editSymbol = u.symbol
    editDimension = u.dimension
    editFactor = u.toBaseFactor
    rowErrors = { ...rowErrors, [u.id]: '' }
  }
  function cancelEdit() { editingId = null }

  async function saveEdit(id: string) {
    const name = editName.trim()
    const symbol = editSymbol.trim()
    if (!name || !symbol) { rowErrors = { ...rowErrors, [id]: 'Name und Kürzel erforderlich.' }; return }
    const factor = editDimension === 'count' ? 1 : Number(editFactor)
    if (editDimension !== 'count' && (!Number.isFinite(factor) || factor <= 0)) {
      rowErrors = { ...rowErrors, [id]: 'Faktor muss > 0 sein.' }; return
    }
    editSaving = true
    rowErrors = { ...rowErrors, [id]: '' }
    try {
      const res = await apiFetch(`/api/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol, dimension: editDimension, toBaseFactor: factor }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { rowErrors = { ...rowErrors, [id]: body.error ?? `Fehler ${res.status}` }; return }
      unitRows = unitRows.map((u) => (u.id === id ? (body as Unit) : u))
      editingId = null
    } catch {
      rowErrors = { ...rowErrors, [id]: 'Netzwerkfehler.' }
    } finally {
      editSaving = false
    }
  }

  async function addUnit() {
    const name = newName.trim()
    const symbol = newSymbol.trim()
    if (!name || !symbol) { addError = 'Name und Kürzel erforderlich.'; return }
    const factor = newDimension === 'count' ? 1 : Number(newFactor)
    if (newDimension !== 'count' && (!Number.isFinite(factor) || factor <= 0)) {
      addError = 'Faktor muss > 0 sein.'; return
    }
    adding = true
    addError = null
    try {
      const res = await apiFetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, symbol, dimension: newDimension, toBaseFactor: factor }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { addError = body.error ?? `Fehler ${res.status}`; return }
      unitRows = [...unitRows, body as Unit]
      newName = ''
      newSymbol = ''
      newDimension = 'count'
      newFactor = '1'
      toast.success('Einheit angelegt')
    } catch {
      addError = 'Netzwerkfehler.'
    } finally {
      adding = false
    }
  }

  function requestDelete(u: Unit) {
    showConfirm('Einheit löschen', `„${u.name}" (${u.symbol}) löschen?`, () => {
      closeConfirm()
      performDelete(u.id)
    })
  }

  async function performDelete(id: string) {
    deleting = id
    try {
      const res = await apiFetch(`/api/units/${id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? 'Einheit wird noch verwendet.'))
        return
      }
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? `Fehler ${res.status}`))
        return
      }
      unitRows = unitRows.filter((u) => u.id !== id)
      toast.success('Einheit gelöscht')
    } catch {
      toast.error('Netzwerkfehler beim Löschen.')
    } finally {
      deleting = null
    }
  }

  async function applySuggestion(s: Suggestion) {
    if (existingSymbols.has(s.symbol)) return
    try {
      const res = await apiFetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `Fehler ${res.status}`); return }
      unitRows = [...unitRows, body as Unit]
      toast.success(`${s.name} hinzugefügt`)
    } catch {
      toast.error('Netzwerkfehler.')
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
    <span class="breadcrumb-current" aria-current="page">Einheiten</span>
  </nav>

  <header class="page-header">
    <h1 class="page-title">Einheiten</h1>
    <p class="page-desc">
      Verwalte Mengeneinheiten und ihre Umrechnung. Masse-/Volumen-Einheiten werden über einen Faktor auf
      die Basiseinheit (g bzw. ml) umgerechnet; Stückzahl-Einheiten (Stück, Packung, …) bleiben eigenständig.
      Damit z.B. „Flasche" gegen Liter vergleichbar wird, hinterlege die Größe pro Artikel als Gebinde
      (Artikel-Detailseite → „Gebinde"). System-Einheiten sind schreibgeschützt.
    </p>
  </header>

  {#if pageLoadError}
    <div class="alert alert--error" role="alert" style="margin-bottom: var(--space-6);">{pageLoadError}</div>
  {/if}

  <!-- ── Liste ────────────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header section-header--row">
      <h2 class="section-title">Meine Einheiten</h2>
      {#if availableSuggestions.length > 0}
        <button class="btn-ghost" type="button" onclick={() => (showSuggestions = true)}>+ Vorschläge</button>
      {/if}
    </div>

    <div class="unit-list" role="list">
      {#each unitRows as unit (unit.id)}
        <div class="unit-row" role="listitem">
          {#if editingId === unit.id}
            <div class="unit-edit">
              <div class="edit-fields">
                <input class="input" type="text" bind:value={editName} placeholder="Name" maxlength="32" aria-label="Name" />
                <input class="input input--sym" type="text" bind:value={editSymbol} placeholder="Kürzel" maxlength="8" aria-label="Kürzel" />
                <select class="input" bind:value={editDimension} aria-label="Dimension">
                  <option value="count">Stückzahl</option>
                  <option value="mass">Masse (Basis g)</option>
                  <option value="volume">Volumen (Basis ml)</option>
                </select>
                {#if editDimension !== 'count'}
                  <input class="input input--factor" type="number" min="0" step="0.0001" bind:value={editFactor} aria-label="Faktor zur Basiseinheit" />
                {/if}
              </div>
              {#if rowErrors[unit.id]}<p class="field-error">{rowErrors[unit.id]}</p>{/if}
              <div class="edit-actions">
                <button class="btn-save-inline" type="button" disabled={editSaving} onclick={() => saveEdit(unit.id)}>Speichern</button>
                <button class="btn-cancel-inline" type="button" onclick={cancelEdit}>Abbrechen</button>
              </div>
            </div>
          {:else}
            <div class="unit-info">
              <div class="unit-info-main">
                <span class="unit-name">{unit.name}</span>
                <span class="unit-symbol">{unit.symbol}</span>
                <span class="dim-badge dim-badge--{unit.dimension}">{DIM_LABEL[unit.dimension]}</span>
                {#if unit.isSystem}<span class="system-badge">System</span>{/if}
              </div>
              <span class="unit-factor">{factorDisplay(unit)}</span>
            </div>
            {#if !unit.isSystem}
              <div class="unit-actions">
                <button class="btn-edit-inline" type="button" onclick={() => startEdit(unit)}>Bearbeiten</button>
                <button class="btn-delete-inline" type="button" disabled={deleting === unit.id} onclick={() => requestDelete(unit)}>Löschen</button>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Neue Einheit ─────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header"><h2 class="section-title">Neue Einheit anlegen</h2></div>
    {#if addError}<div class="alert alert--error" role="alert">{addError}</div>{/if}
    <div class="add-form">
      <div class="add-fields">
        <input class="input" type="text" bind:value={newName} placeholder="Name — z.B. Esslöffel" maxlength="32" aria-label="Name" />
        <input class="input input--sym" type="text" bind:value={newSymbol} placeholder="Kürzel" maxlength="8" aria-label="Kürzel" />
        <select class="input" bind:value={newDimension} aria-label="Dimension">
          <option value="count">Stückzahl</option>
          <option value="mass">Masse (Basis g)</option>
          <option value="volume">Volumen (Basis ml)</option>
        </select>
        {#if newDimension !== 'count'}
          <input class="input input--factor" type="number" min="0" step="0.0001" bind:value={newFactor} aria-label="Faktor zur Basiseinheit" placeholder="Faktor" />
        {/if}
      </div>
      {#if newDimension !== 'count'}
        <p class="factor-hint">Faktor = wie viele {newDimension === 'mass' ? 'Gramm' : 'Milliliter'} eine Einheit entspricht (z.B. EL = 15).</p>
      {/if}
      <div class="add-footer">
        <button class="btn-primary" type="button" disabled={adding} onclick={addUnit}>Anlegen</button>
      </div>
    </div>
  </section>
</div>

<!-- ── Vorschläge (Modal) ─────────────────────────────────────────────── -->
<Modal open={showSuggestions} title="Gängige Einheiten" size="md" onClose={() => (showSuggestions = false)}>
  <p class="suggest-hint">Tippe auf eine Einheit, um sie zu übernehmen. Bereits vorhandene sind ausgegraut.</p>
  <div class="suggest-grid">
    {#each SUGGESTIONS as s (s.symbol)}
      {@const exists = existingSymbols.has(s.symbol)}
      <button class="suggest-item" type="button" disabled={exists} onclick={() => applySuggestion(s)}>
        <span class="suggest-name">{s.name}</span>
        <span class="suggest-meta">{s.symbol} · {DIM_LABEL[s.dimension]}{s.dimension !== 'count' ? ` · ${s.toBaseFactor}${s.dimension === 'mass' ? 'g' : 'ml'}` : ''}</span>
        {#if exists}<span class="suggest-exists">vorhanden</span>{/if}
      </button>
    {/each}
  </div>
  {#snippet footer()}
    <button class="btn-cancel-inline" type="button" onclick={() => (showSuggestions = false)}>Schließen</button>
  {/snippet}
</Modal>

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
  .section-header--row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); margin: 0; }

  .unit-list { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
  .unit-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border-subtle); background-color: var(--color-surface); min-height: 52px; }
  .unit-row:last-child { border-bottom: none; }
  .unit-info { display: flex; flex-direction: column; gap: var(--space-1); flex: 1; min-width: 0; }
  .unit-info-main { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .unit-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .unit-symbol { font-size: var(--text-xs); color: var(--color-text-muted); font-family: var(--font-mono, monospace); }
  .unit-factor { font-size: var(--text-xs); color: var(--color-text-muted); }
  .dim-badge { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: 11px; font-weight: 600; }
  .dim-badge--mass { background: var(--color-primary-subtle); color: var(--color-primary); }
  .dim-badge--volume { background: #e0f2fe; color: #0369a1; }
  .dim-badge--count { background: var(--color-surface-sunken); color: var(--color-text-muted); }
  .system-badge { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-full); background: var(--color-surface-sunken); color: var(--color-text-muted); font-size: 11px; font-weight: 600; }
  .unit-actions { display: flex; gap: var(--space-2); flex-shrink: 0; }

  .unit-edit { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }
  .edit-fields, .add-fields { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .edit-actions { display: flex; gap: var(--space-2); }
  .field-error { font-size: var(--text-xs); color: var(--color-danger, #dc2626); margin: 0; }
  .factor-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }

  .add-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .add-footer { display: flex; }

  .input { flex: 1 1 140px; min-width: 0; height: 40px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background-color: var(--color-surface); color: var(--color-text-primary); font-family: var(--font-body); font-size: var(--text-base); outline: none; box-sizing: border-box; }
  .input:focus { border-color: var(--color-border-focus); box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15); }
  .input--sym { flex: 0 1 90px; }
  .input--factor { flex: 0 1 110px; }

  .alert { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 500; margin-bottom: var(--space-4); }
  .alert--error { background-color: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); border: 1px solid rgba(220, 38, 38, 0.2); }

  .btn-primary { display: inline-flex; align-items: center; gap: var(--space-2); height: 40px; padding: 0 var(--space-5); border-radius: var(--radius-md); border: none; background-color: var(--color-primary); color: var(--color-text-inverse); font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
  .btn-primary:hover:not(:disabled) { background-color: var(--color-primary-hover); }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  .btn-ghost { border: 1px solid var(--color-border); background: transparent; color: var(--color-primary); border-radius: var(--radius-md); height: 32px; padding: 0 var(--space-3); font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
  .btn-ghost:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }

  .btn-edit-inline, .btn-cancel-inline { height: 30px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-secondary); font-size: var(--text-xs); font-weight: 500; cursor: pointer; white-space: nowrap; }
  .btn-edit-inline:hover { border-color: var(--color-primary); color: var(--color-primary); background: var(--color-primary-subtle); }
  .btn-delete-inline { height: 30px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 500; cursor: pointer; white-space: nowrap; }
  .btn-delete-inline:hover:not(:disabled) { border-color: var(--color-danger, #dc2626); color: var(--color-danger, #dc2626); background: var(--color-danger-subtle, #fee2e2); }
  .btn-save-inline { height: 30px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: none; background: var(--color-primary); color: var(--color-text-inverse); font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
  .btn-save-inline:disabled { opacity: 0.5; cursor: not-allowed; }

  .suggest-hint { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-4); }
  .suggest-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-2); }
  .suggest-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); cursor: pointer; text-align: left; }
  .suggest-item:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .suggest-item:disabled { opacity: 0.5; cursor: not-allowed; }
  .suggest-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .suggest-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
  .suggest-exists { font-size: 10px; color: var(--color-text-muted); }

  @media (max-width: 560px) {
    .page { padding: var(--space-5) var(--space-3) var(--space-12); }
    .settings-section { padding: var(--space-4); }
    .edit-fields .input, .add-fields .input { flex-basis: 100%; }
    .unit-row { flex-direction: column; align-items: flex-start; }
    .unit-actions { width: 100%; justify-content: flex-end; }
    .suggest-grid { grid-template-columns: 1fr; }
  }
</style>
