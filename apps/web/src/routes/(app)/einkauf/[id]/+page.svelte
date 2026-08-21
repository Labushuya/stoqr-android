<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { goto, invalidateAll } from '$app/navigation'
  import { toast } from '$lib/stores/toast'
  import { formatEuroApprox, type LineEstimate, type CostSummary } from '$lib/utils/prices'
  import DepositBadge from '$lib/components/DepositBadge.svelte'

  let { data }: { data: PageData } = $props()

  type Unit = { id: string; name: string; symbol: string }
  type Item = {
    id: string
    productId: string | null
    freeTextName: string | null
    quantity: string
    unit: string
    realStatus: 'offen' | 'gekauft' | 'ausverkauft'
    product: { id: string; name: string } | null
  }
  type Trip = {
    id: string
    name: string | null
    storeId: string | null
    status: 'begonnen' | 'pausiert' | 'beendet'
    startedAt: string
    endedAt: string | null
    store: { id: string; name: string; chain: string | null } | null
    items: Item[]
  }

  const trip = $derived(data.trip as Trip)
  const units = $derived(data.units as Unit[])
  const isDone = $derived(trip.status === 'beendet')
  const estimates = $derived((data.estimates as Record<string, LineEstimate>) ?? {})
  const costSummary = $derived(data.costSummary as CostSummary | null)

  const STATUS_LABEL: Record<Trip['status'], string> = { begonnen: 'Aktiv', pausiert: 'Pausiert', beendet: 'Beendet' }
  const REAL_LABEL: Record<Item['realStatus'], string> = { offen: 'Offen', gekauft: 'Gekauft', ausverkauft: 'Ausverkauft' }

  function unitLabel(symbol: string): string {
    return units.find((u) => u.symbol === symbol)?.name ?? symbol
  }
  function itemName(i: Item): string {
    return i.product?.name ?? i.freeTextName ?? 'Unbenannt'
  }
  function qtyDisplay(i: Item): string {
    return `${Number(i.quantity).toLocaleString('de-DE', { maximumFractionDigits: 3 })} ${unitLabel(i.unit)}`
  }
  function tripTitle(t: Trip): string {
    if (t.name) return t.name
    const store = t.store?.name ?? 'Einkauf'
    const d = new Date(t.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    return `${store} · ${d}`
  }

  // ── Einkauf umbenennen (G8-5a) ────────────────────────────────────────────
  let renaming = $state(false)
  let renameValue = $state('')
  let renameSaving = $state(false)
  function startRename() {
    renameValue = trip.name ?? ''
    renaming = true
  }
  async function saveRename() {
    renameSaving = true
    try {
      const res = await apiFetch(`/api/shopping-trips/${trip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() || null }),
      })
      if (!res.ok) { toast.error('Umbenennen fehlgeschlagen.'); return }
      renaming = false
      toast.success('Einkauf umbenannt')
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      renameSaving = false
    }
  }

  // ── Positions-Aktionen ─────────────────────────────────────────────────
  async function setRealStatus(i: Item, realStatus: Item['realStatus']) {
    // Toggle: nochmal auf denselben Status → zurück auf 'offen'
    const next = i.realStatus === realStatus ? 'offen' : realStatus
    const res = await apiFetch(`/api/shopping-trips/${trip.id}/items/${i.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ realStatus: next }),
    })
    if (!res.ok) { toast.error('Statusänderung fehlgeschlagen.'); return }
    await invalidateAll()
  }

  async function release(i: Item) {
    const res = await apiFetch(`/api/shopping-trips/${trip.id}/items/${i.id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { toast.error('Freigeben fehlgeschlagen.'); return }
    toast.success('Zurück in die Einkaufsliste.')
    await invalidateAll()
  }

  function bookInHref(i: Item): string {
    const params = new URLSearchParams()
    if (i.productId) {
      params.set('productId', i.productId)
      if (i.product?.name) params.set('productName', i.product.name)
    }
    params.set('qty', i.quantity)
    params.set('unit', i.unit)
    params.set('fromTripItem', i.id)
    params.set('tripId', trip.id)
    if (trip.storeId) params.set('storeId', trip.storeId)
    return `/inventar/easy-add?${params.toString()}`
  }

  // ── Run-Aktionen ────────────────────────────────────────────────────────
  async function tripAction(action: 'pause' | 'resume' | 'end') {
    const res = await apiFetch(`/api/shopping-trips/${trip.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      toast.error(b?.error ?? 'Aktion fehlgeschlagen.')
      return
    }
    if (action === 'end') { toast.success('Einkauf beendet.'); await invalidateAll(); return }
    await invalidateAll()
  }

  async function deleteTrip() {
    if (!confirm('Diesen Einkauf löschen? Reservierte Bedarfe kehren in die Einkaufsliste zurück.')) return
    const res = await apiFetch(`/api/shopping-trips/${trip.id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { toast.error('Löschen fehlgeschlagen.'); return }
    goto('/einkauf')
  }
</script>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einkauf" class="breadcrumb-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einkauf
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current" aria-current="page">{tripTitle(trip)}</span>
  </nav>

  <header class="page-header">
    <div class="title-row">
      {#if renaming}
        <input
          class="rename-input"
          type="text"
          bind:value={renameValue}
          placeholder="Name des Einkaufs"
          maxlength="128"
          aria-label="Einkauf umbenennen"
          onkeydown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') renaming = false }}
        />
        <button class="btn-rename" type="button" disabled={renameSaving} onclick={saveRename}>Speichern</button>
        <button class="btn-rename btn-rename--ghost" type="button" onclick={() => (renaming = false)}>Abbrechen</button>
      {:else}
        <h1 class="page-title">{tripTitle(trip)}</h1>
        <span class="status-badge status-badge--{trip.status}">{STATUS_LABEL[trip.status]}</span>
        <button class="btn-rename btn-rename--ghost" type="button" onclick={startRename} aria-label="Einkauf umbenennen">Umbenennen</button>
      {/if}
    </div>
    {#if trip.store}<p class="page-desc">Markt: {trip.store.name}{trip.store.chain ? ` (${trip.store.chain})` : ''}</p>{/if}
  </header>

  <!-- Run-Aktionen -->
  {#if !isDone}
    <div class="toolbar">
      {#if trip.status === 'begonnen'}
        <button class="btn-ghost" type="button" onclick={() => tripAction('pause')}>Pausieren</button>
      {:else if trip.status === 'pausiert'}
        <button class="btn-ghost" type="button" onclick={() => tripAction('resume')}>Fortsetzen</button>
      {/if}
      <button class="btn-ghost btn-ghost--strong" type="button" onclick={() => tripAction('end')}>Einkauf beenden</button>
      <button class="btn-x-text" type="button" onclick={deleteTrip}>Löschen</button>
    </div>
  {/if}

  <section class="card">
    <h2 class="section-title">Positionen <span class="section-sub">({trip.items.length})</span></h2>

    {#if costSummary}
      <div class="cost-summary">
        {#if costSummary.totalDepositCents > 0}
          <span class="cost-line-row">Ware {formatEuroApprox(costSummary.totalCents)}</span>
          <span class="cost-line-row cost-line-row--deposit">Pfand {formatEuroApprox(costSummary.totalDepositCents)}</span>
          <span class="cost-total">Summe {formatEuroApprox(costSummary.totalCents + costSummary.totalDepositCents)}</span>
        {:else}
          <span class="cost-total">Einkauf {formatEuroApprox(costSummary.totalCents)}</span>
        {/if}
        {#if costSummary.isPartial}
          <span class="cost-warn">
            ⚠ Schätzung unvollständig{#if costSummary.itemsWithoutPrice > 0}: {costSummary.itemsWithoutPrice} ohne Preis{/if}{#if costSummary.itemsNotComparable > 0}, {costSummary.itemsNotComparable} Einheit nicht vergleichbar{/if}
          </span>
        {/if}
      </div>
    {:else if !trip.storeId && trip.items.length > 0}
      <p class="cost-hint">Kein Markt zugeordnet — keine Preisschätzung möglich.</p>
    {/if}

    {#if trip.items.length === 0}
      <p class="empty-hint">Noch keine Positionen. Weise in der Einkaufsliste Bedarf diesem Einkauf zu.</p>
    {:else}
      <ul class="item-list">
        {#each trip.items as i (i.id)}
          {@const est = estimates[i.id]}
          <li class="item" class:item--gekauft={i.realStatus === 'gekauft'} class:item--ausverkauft={i.realStatus === 'ausverkauft'}>
            <div class="item-main">
              <span class="item-name">{itemName(i)}</span>
              <span class="item-meta">
                {qtyDisplay(i)}
                <span class="real-badge real-badge--{i.realStatus}">{REAL_LABEL[i.realStatus]}</span>
                {#if est && est.cents != null}
                  <span class="cost-line">{formatEuroApprox(est.cents)}</span>
                {:else if est && !est.hasPrice}
                  <span class="cost-line cost-line--none">kein Preis</span>
                {:else if est && !est.comparable}
                  <span class="cost-line cost-line--none">Einheit ≠</span>
                {/if}
                {#if est && est.depositCents > 0}<DepositBadge depositCt={est.depositCents} />{/if}
              </span>
            </div>
            {#if !isDone}
              <div class="item-actions">
                <button class="chip" class:chip--on={i.realStatus === 'gekauft'} type="button"
                        onclick={() => setRealStatus(i, 'gekauft')}>Gekauft</button>
                <button class="chip" class:chip--on={i.realStatus === 'ausverkauft'} type="button"
                        onclick={() => setRealStatus(i, 'ausverkauft')}>Ausverkauft</button>
                <a class="btn-book" href={bookInHref(i)}>Einbuchen</a>
                <button class="btn-x" type="button" aria-label="Freigeben" title="Zurück in die Einkaufsliste"
                        onclick={() => release(i)}>✕</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .page { max-width: 720px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-16); }
  .breadcrumb { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted); }
  .breadcrumb-back { display: inline-flex; align-items: center; gap: var(--space-1); color: var(--color-primary); text-decoration: none; font-weight: 500; }
  .breadcrumb-sep { color: var(--color-text-muted); }
  .breadcrumb-current { color: var(--color-text-secondary); font-weight: 500; }

  .page-header { margin-bottom: var(--space-4); }
  .title-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .rename-input { height: 34px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-primary); font-size: var(--text-base); min-width: 220px; }
  .btn-rename { height: 30px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: none; background: var(--color-primary); color: var(--color-text-inverse); font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
  .btn-rename:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-rename--ghost { background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); }
  .btn-rename--ghost:hover { border-color: var(--color-primary); color: var(--color-primary); }  .page-title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); margin: 0; }
  .page-desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: var(--space-1) 0 0; }

  .toolbar { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-bottom: var(--space-4); }
  .btn-ghost--strong { color: var(--color-text-inverse); background: var(--color-primary); border-color: var(--color-primary); }
  .btn-ghost--strong:hover { background: var(--color-primary-hover); }
  .btn-x-text { border: none; background: none; color: var(--color-text-muted); cursor: pointer; font-size: var(--text-sm); }
  .btn-x-text:hover { color: var(--color-danger, #dc2626); }

  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); margin: 0 0 var(--space-4); }
  .section-sub { font-size: var(--text-xs); font-weight: 500; color: var(--color-text-muted); }
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }

  .item-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border-subtle); flex-wrap: wrap; }
  .item:last-child { border-bottom: none; }
  .item--ausverkauft { opacity: 0.6; }
  .item--ausverkauft .item-name { text-decoration: line-through; }

  .item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .item-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .item-meta { font-size: var(--text-xs); color: var(--color-text-muted); display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }

  .real-badge { display: inline-flex; align-items: center; height: 17px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: 10px; font-weight: 700; }
  .real-badge--offen { background: var(--color-surface-sunken); color: var(--color-text-muted); }
  .real-badge--gekauft { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  .real-badge--ausverkauft { background: #fee2e2; color: #dc2626; }

  .item-actions { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; flex-wrap: wrap; }
  .btn-book { font-size: var(--text-xs); font-weight: 600; color: var(--color-primary); text-decoration: none; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-1) var(--space-2); }
  .btn-book:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .btn-x { border: none; background: none; color: var(--color-text-muted); cursor: pointer; font-size: 14px; padding: var(--space-1); }
  .btn-x:hover { color: var(--color-danger, #dc2626); }

  .status-badge { display: inline-flex; align-items: center; height: 20px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: 11px; font-weight: 700; }
  .status-badge--begonnen { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  .status-badge--pausiert { background: #fef9c3; color: #a16207; }
  .status-badge--beendet { background: var(--color-surface-sunken); color: var(--color-text-muted); }

  @media (max-width: 560px) {
    .page { padding: var(--space-4) var(--space-3) var(--space-12); }
    .card { padding: var(--space-4); }
  }

  /* ── Kosten-Schätzung (Block F) ───────────────────────────────────────── */
  .cost-summary { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--space-3); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); border-radius: var(--radius-md); }
  .cost-total { font-size: var(--text-base); font-weight: 700; color: var(--color-text-primary); }
  .cost-line-row { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .cost-line-row--deposit { color: #1d4ed8; font-weight: 600; }
  .cost-warn { font-size: var(--text-xs); color: #c2410c; }
  .cost-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 var(--space-3); }
  .cost-line { font-weight: 600; color: var(--color-text-secondary); }
  .cost-line--none { font-weight: 400; color: var(--color-text-muted); font-style: italic; }
</style>
