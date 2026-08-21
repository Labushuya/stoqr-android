<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { backToSettings } from '$lib/client/back-to-settings'
  import { toast } from '$lib/stores/toast'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import { buildCategoryTree } from '$lib/utils/category-tree'

  let { data }: { data: PageData } = $props()

  type Mapping = {
    id: string
    source: 'off' | 'globus'
    token: string
    categoryId: string
    categoryName: string | null
  }
  type Category = { id: string; name: string; icon: string | null; parentId: string | null; sortOrder: number }

  // svelte-ignore state_referenced_locally
  let rows = $state<Mapping[]>(data.mappings as Mapping[])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)

  const categories = $derived(data.categories as Category[])
  const globusSegments = $derived((data.globusSegments as string[] | undefined) ?? [])
  const offTags = $derived((data.offTags as string[] | undefined) ?? [])
  const NBSP = String.fromCharCode(160)
  const categoryTree = $derived(
    buildCategoryTree(
      categories.map((c) => ({ id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, sortOrder: c.sortOrder }))
    )
  )
  const catIndent = (depth: number) => (depth > 0 ? NBSP.repeat(depth * 4) : '')
  const SOURCE_LABEL: Record<string, string> = { off: 'OpenFoodFacts', globus: 'Globus-Katalog' }

  // ── Add form ──────────────────────────────────────────────────────────────
  let newSource = $state<'off' | 'globus'>('globus')
  let newToken = $state('')
  let newCategoryId = $state('')
  let adding = $state(false)
  let addError = $state<string | null>(null)

  // ── Delete ──────────────────────────────────────────────────────────────
  let deleting = $state<string | null>(null)
  let confirmModal = $state<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)
  function closeConfirm() { confirmModal = null }

  async function addMapping() {
    const token = newToken.trim()
    if (!token) { addError = 'Token (Tag/Segment) erforderlich.'; return }
    if (!newCategoryId) { addError = 'Zielkategorie erforderlich.'; return }
    adding = true
    addError = null
    try {
      const res = await apiFetch('/api/category-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: newSource, token, categoryId: newCategoryId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { addError = body.error ?? `Fehler ${res.status}`; return }
      rows = [...rows, body as Mapping]
      newToken = ''
      newCategoryId = ''
      toast.success('Regel angelegt')
    } catch {
      addError = 'Netzwerkfehler.'
    } finally {
      adding = false
    }
  }

  function requestDelete(m: Mapping) {
    confirmModal = {
      open: true,
      title: 'Regel löschen',
      message: `Regel „${m.token}" → ${m.categoryName ?? '?'} löschen?`,
      onConfirm: () => { closeConfirm(); performDelete(m.id) },
    }
  }
  async function performDelete(id: string) {
    deleting = id
    try {
      const res = await apiFetch(`/api/category-mappings/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}))
        toast.error(String(body?.error ?? `Fehler ${res.status}`))
        return
      }
      rows = rows.filter((m) => m.id !== id)
      toast.success('Regel gelöscht')
    } catch {
      toast.error('Netzwerkfehler beim Löschen.')
    } finally {
      deleting = null
    }
  }
</script>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einstellungen" class="breadcrumb-back" onclick={backToSettings}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einstellungen
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current" aria-current="page">Kategorie-Zuordnung</span>
  </nav>

  <header class="page-header">
    <h1 class="page-title">Kategorie-Zuordnung</h1>
    <p class="page-desc">
      Regeln, die einen Katalog-/OpenFoodFacts-Begriff automatisch einer stoqr-Kategorie zuordnen.
      Beim Scannen und beim Katalog-Sync greift die passende Regel <strong>bevor</strong> die eingebaute
      Erkennung zieht. Eine manuell am Artikel gesetzte Kategorie bleibt Vorrang.
    </p>
  </header>

  {#if pageLoadError}
    <div class="alert alert--error" role="alert" style="margin-bottom: var(--space-6);">{pageLoadError}</div>
  {/if}

  <!-- ── Liste ────────────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header"><h2 class="section-title">Meine Regeln</h2></div>

    {#if rows.length === 0}
      <p class="empty-hint">Noch keine Regeln. Lege unten eine an — oder nutze im Katalog-Spiegel bei „nicht zuordenbar" den „Regel anlegen"-Button.</p>
    {:else}
      <div class="rule-list" role="list">
        {#each rows as m (m.id)}
          <div class="rule-row" role="listitem">
            <div class="rule-info">
              <span class="src-badge src-badge--{m.source}">{SOURCE_LABEL[m.source] ?? m.source}</span>
              <span class="rule-token">{m.token}</span>
              <span class="rule-arrow" aria-hidden="true">→</span>
              <span class="rule-cat">{m.categoryName ?? '(gelöscht)'}</span>
            </div>
            <button class="btn-delete-inline" type="button" disabled={deleting === m.id} onclick={() => requestDelete(m)}>Löschen</button>
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Neue Regel ───────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header"><h2 class="section-title">Neue Regel</h2></div>
    {#if addError}<div class="alert alert--error" role="alert">{addError}</div>{/if}
    <div class="add-form">
      <div class="add-fields">
        <select class="input input--src" bind:value={newSource} aria-label="Quelle">
          <option value="globus">Globus-Katalog</option>
          <option value="off">OpenFoodFacts</option>
        </select>
        <input class="input" type="text" bind:value={newToken}
          list={newSource === 'globus' ? 'token-globus' : 'token-off'}
          placeholder={newSource === 'off' ? 'OFF-Tag — z.B. en:yogurts' : 'Katalog-Segment — z.B. Getränke'}
          maxlength="200" aria-label="Token" />
        <datalist id="token-globus">
          {#each globusSegments as s (s)}<option value={s}></option>{/each}
        </datalist>
        <datalist id="token-off">
          {#each offTags as t (t)}<option value={t}></option>{/each}
        </datalist>
        <select class="input" bind:value={newCategoryId} aria-label="Zielkategorie">
          <option value="">— Zielkategorie —</option>
          {#each categoryTree as c (c.id)}<option value={c.id}>{catIndent(c.depth)}{c.name}</option>{/each}
        </select>
      </div>
      <p class="token-hint">
        {#if newSource === 'globus'}
          Ein Token ist ein einzelnes Katalog-Pfad-Segment (z.B. „Getränke" oder „Kühlregal") — Groß/Klein egal.
          {#if globusSegments.length > 0}Die Liste schlägt real vorkommende Segmente aus deinen Katalog-Sicherungen vor.{:else}Noch keine Katalog-Segmente vorhanden — sichere zuerst den Katalog, dann erscheinen echte Vorschläge.{/if}
        {:else}
          Ein Token ist ein ganzer OpenFoodFacts-Tag (Form „en:…", z.B. „en:yogurts"). Die Liste zeigt gängige Tags.
        {/if}
      </p>
      <div class="add-footer">
        <button class="btn-primary" type="button" disabled={adding} onclick={addMapping}>Anlegen</button>
      </div>
    </div>
  </section>
</div>

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
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }

  .rule-list { display: flex; flex-direction: column; border: 1px solid var(--color-border); border-radius: var(--radius-lg); overflow: hidden; }
  .rule-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--color-border-subtle); background-color: var(--color-surface); min-height: 52px; }
  .rule-row:last-child { border-bottom: none; }
  .rule-info { display: flex; align-items: center; gap: var(--space-2); flex: 1; min-width: 0; flex-wrap: wrap; }
  .rule-token { font-family: var(--font-mono, monospace); font-size: var(--text-sm); color: var(--color-text-primary); }
  .rule-arrow { color: var(--color-text-muted); }
  .rule-cat { font-weight: 600; font-size: var(--text-sm); color: var(--color-text-primary); }
  .src-badge { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: 11px; font-weight: 600; }
  .src-badge--off { background: var(--color-primary-subtle); color: var(--color-primary); }
  .src-badge--globus { background: #e0f2fe; color: #0369a1; }

  .add-form { display: flex; flex-direction: column; gap: var(--space-4); }
  .add-fields { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .add-footer { display: flex; }
  .token-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; line-height: 1.5; }
  .input { flex: 1 1 180px; min-width: 0; }
  .input--src { flex: 0 1 170px; }

  .alert { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 500; margin-bottom: var(--space-4); }
  .alert--error { background-color: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); border: 1px solid rgba(220, 38, 38, 0.2); }

  @media (max-width: 560px) {
    .page { padding: var(--space-5) var(--space-3) var(--space-12); }
    .settings-section { padding: var(--space-4); }
    .add-fields .input { flex-basis: 100%; }
    .rule-row { flex-direction: column; align-items: flex-start; }
  }
</style>
