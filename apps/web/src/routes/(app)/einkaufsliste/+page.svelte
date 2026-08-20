<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { invalidateAll } from '$app/navigation'
  import { toast } from '$lib/stores/toast'
  import { buildUnitMetaMap, buildPackSize } from '$lib/utils/stock'
  import { estimateLineCost, summarizeCosts, formatEuroApprox } from '$lib/utils/prices'
  import { rankCheapestStore } from '$lib/utils/price-compare'
  import DepositBadge from '$lib/components/DepositBadge.svelte'

  let { data }: { data: PageData } = $props()

  type Unit = { id: string; name: string; symbol: string }
  type StoreOpt = { id: string; name: string; chain: string | null }
  type Trip = {
    id: string
    name: string | null
    storeId: string | null
    status: 'begonnen' | 'pausiert' | 'beendet'
    startedAt: string
    store: { id: string; name: string; chain: string | null } | null
  }
  type Item = {
    id: string
    productId: string | null
    freeTextName: string | null
    quantity: string
    unit: string
    source: 'manual' | 'auto' | 'bring'
    isChecked: boolean
    notes: string | null
    preferredStoreId: string | null
    product: { id: string; name: string } | null
    preferredStore: { id: string; name: string } | null
    reservedTripItemId: string | null
    reservedTripId: string | null
    reservedTripName: string | null
    reservedTripStatus: 'begonnen' | 'pausiert' | 'beendet' | null
    reservedTripStoreId: string | null
  }

  const items = $derived((data.items as Item[]) ?? [])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)
  const units = $derived(data.units as Unit[])
  const stores = $derived(data.stores as StoreOpt[])
  const trips = $derived((data.trips as Trip[]) ?? [])
  // Aktive/pausierte Runs (Ziele fürs Zuweisen/Verschieben).
  const openTrips = $derived(trips.filter((t) => t.status !== 'beendet'))

  // Markt-Auswahl: '' = Alle. Ein Einkauf = ein Markt (Einzelauswahl).
  let selectedStore = $state('')

  // ── Preis-Schätzung (Block F, client-reaktiv je gewähltem Markt) ───────────
  type PriceRow = { productId: string; storeId: string; priceCt: number; unit: string; isReduced: boolean; basePriceCt: number | null; basePriceUnit: string | null; priceIncludesDeposit: boolean }
  type PackRow = { id: string; defaultUnit: string | null; defaultVolumeMl: string | null; defaultWeightG: string | null; hasDeposit: boolean; depositCt: number | null }
  const priceRows = $derived((data.prices as PriceRow[]) ?? [])
  const metaMap = $derived(buildUnitMetaMap(units))
  // Gebinde-Größe je Produkt (Einheiten v2) für die Estimate-Umrechnung.
  const packByProduct = $derived(
    new Map(((data.packs as PackRow[]) ?? []).map((p) => [p.id, buildPackSize(p)]))
  )
  const packRawByProduct = $derived(
    new Map(((data.packs as PackRow[]) ?? []).map((p) => [p.id, p]))
  )
  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? 'Markt'
  // Günstigster Markt je Artikel (G46): über alle Märkte mit aktuellem Preis, fair
  // pro Basiseinheit (Grundpreis bevorzugt). null = kein eindeutiger/vergleichbarer Sieger.
  function cheapestStoreFor(productId: string | null): string | null {
    if (!productId) return null
    const rows = priceRows.filter((p) => p.productId === productId)
    if (rows.length < 2) return null
    const product = packRawByProduct.get(productId) ?? {}
    const r = rankCheapestStore(rows, product, metaMap)
    return r.cheapestStoreId
  }
  // Lookup aktueller Preis für (productId, gewählter Markt).
  function priceFor(productId: string | null): { priceCt: number; unit: string; depositCt: number | null; priceIncludesDeposit: boolean } | null {
    if (!productId || !selectedStore) return null
    const r = priceRows.find((p) => p.productId === productId && p.storeId === selectedStore)
    if (!r) return null
    const pack = packRawByProduct.get(productId)
    const depositCt = pack?.hasDeposit ? pack.depositCt : null
    return { priceCt: r.priceCt, unit: r.unit, depositCt, priceIncludesDeposit: r.priceIncludesDeposit }
  }
  function estimateFor(i: Item) {
    const packSize = i.productId ? packByProduct.get(i.productId) : undefined
    return estimateLineCost(Number(i.quantity), i.unit, priceFor(i.productId), metaMap, packSize)
  }
  // Summe über die aktuell offenen, sichtbaren, NICHT reservierten Positionen.
  const listSummary = $derived.by(() => {
    if (!selectedStore) return null
    const lines = openItems.filter((i) => !i.reservedTripId).map((i) => estimateFor(i))
    return summarizeCosts(lines)
  })

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
  function reservedName(i: Item): string {
    const t = openTrips.find((x) => x.id === i.reservedTripId)
    if (t) return tripTitle(t)
    return i.reservedTripName ?? 'Einkauf'
  }

  // Markt-Filter: bei gewähltem Markt X → Einträge dieses Markts PLUS ohne Markt ('egal').
  function matchesStore(i: Item): boolean {
    if (!selectedStore) return true
    return i.preferredStoreId === selectedStore || i.preferredStoreId == null
  }

  const openItems = $derived(items.filter((i) => !i.isChecked && matchesStore(i)))
  const checkedItems = $derived(items.filter((i) => i.isChecked && matchesStore(i)))

  // ── Manueller Eintrag ────────────────────────────────────────────────────
  let newName = $state('')
  let newQty = $state('1')
  let newUnit = $state('piece')
  let adding = $state(false)

  async function addItem() {
    const name = newName.trim()
    if (!name) return
    adding = true
    try {
      const res = await apiFetch('/api/shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ freeTextName: name, quantity: Number(newQty) || 1, unit: newUnit }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error ?? `Fehler ${res.status}`); return }
      newName = ''
      newQty = '1'
      newUnit = 'piece'
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      adding = false
    }
  }

  async function toggle(i: Item) {
    const next = !i.isChecked
    const res = await apiFetch(`/api/shopping-list/${i.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isChecked: next }),
    })
    if (!res.ok) { toast.error('Fehler beim Abhaken.'); return }
    await invalidateAll()
  }

  async function removeItem(i: Item) {
    const res = await apiFetch(`/api/shopping-list/${i.id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const b = await res.json().catch(() => ({}))
      toast.error(b?.error ?? 'Bedarf ist einem Einkauf zugewiesen.')
      return
    }
    if (!res.ok && res.status !== 204) { toast.error('Fehler beim Löschen.'); return }
    await invalidateAll()
  }

  let generating = $state(false)
  async function generateNeeds() {
    generating = true
    try {
      const res = await apiFetch('/api/shopping-list/generate', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body?.error ?? 'Fehler'); return }
      toast.success(`Bedarf aktualisiert (${body.created} neu, ${body.updated} aktualisiert, ${body.removed} entfernt)`)
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      generating = false
    }
  }

  // ── In Einkauf legen / verschieben (Reservierung) ────────────────────────

  // Findet/erzeugt einen aktiven Run zum gegebenen Markt (null = markt-los).
  async function ensureTripForStore(storeId: string | null): Promise<Trip | null> {
    const existing = openTrips.find((t) => (t.storeId ?? null) === (storeId ?? null))
    if (existing) return existing
    const res = await apiFetch('/api/shopping-trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storeId: storeId || null }),
    })
    if (!res.ok) { toast.error('Einkauf konnte nicht angelegt werden.'); return null }
    return (await res.json()) as Trip
  }

  // Einzelner Bedarf → in Einkauf legen (Run passend zum Eintrag-/gewählten Markt).
  async function bookToTrip(i: Item) {
    const storeId = i.preferredStoreId ?? (selectedStore || null)
    const trip = await ensureTripForStore(storeId)
    if (!trip) return
    const res = await apiFetch(`/api/shopping-trips/${trip.id}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shoppingListItemId: i.id }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      toast.error(b?.error ?? 'Zuweisen fehlgeschlagen.')
      return
    }
    toast.success('In den Einkauf gelegt.')
    await invalidateAll()
  }

  // Sammel-Aktion: alle offenen (markt-passenden) Bedarfe des gewählten Markts.
  let bulking = $state(false)
  async function bookAllForStore() {
    const storeId = selectedStore || null
    bulking = true
    try {
      const trip = await ensureTripForStore(storeId)
      if (!trip) return
      const res = await apiFetch(`/api/shopping-trips/${trip.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reserveAllForStore: storeId }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(b?.error ?? 'Fehler.'); return }
      toast.success(`${b.reserved ?? 0} Bedarf(e) in den Einkauf gelegt.`)
      await invalidateAll()
    } finally {
      bulking = false
    }
  }

  // Reservierten Bedarf in einen anderen Run verschieben.
  async function moveTo(i: Item, toTripId: string) {
    if (!i.reservedTripItemId || !i.reservedTripId) return
    const res = await apiFetch(`/api/shopping-trips/${i.reservedTripId}/items/${i.reservedTripItemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toTripId }),
    })
    if (!res.ok) { toast.error('Verschieben fehlgeschlagen.'); return }
    toast.success('Verschoben.')
    await invalidateAll()
  }


  // Einbuchen: zum Bestand-anlegen-Flow mit Vorbelegung (2c-3).
  // Direktes Einbuchen aus der Liste (ohne Run) — Fallback für markt-lose/schnelle Fälle.
  function bookInHref(i: Item): string {
    const params = new URLSearchParams()
    if (i.productId) {
      params.set('productId', i.productId)
      if (i.product?.name) params.set('productName', i.product.name)
    }
    params.set('qty', i.quantity)
    params.set('unit', i.unit)
    params.set('fromShoppingItem', i.id)
    const storeId = selectedStore || i.preferredStoreId
    if (storeId) params.set('storeId', storeId)
    return `/inventar/easy-add?${params.toString()}`
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Einkaufsliste</h1>
    <p class="page-desc">
      Automatischer Bedarf aus Soll-Ist plus manuelle Einträge. Nach dem Einkauf per „Einbuchen"
      als echten Bestand übernehmen.
    </p>
  </header>

  {#if pageLoadError}
    <div class="alert alert--error" role="alert">{pageLoadError}</div>
  {/if}

  <div class="toolbar">
    {#if stores.length > 0}
      <label class="store-filter">
        <span class="store-filter-label">Einkauf bei</span>
        <select class="input input--store" bind:value={selectedStore}>
          <option value="">Alle Märkte</option>
          {#each stores as s (s.id)}
            <option value={s.id}>{s.name}{s.chain ? ` (${s.chain})` : ''}</option>
          {/each}
        </select>
      </label>
    {/if}
    <button class="btn-ghost" type="button" disabled={generating} onclick={generateNeeds}>
      {generating ? 'Wird berechnet…' : '↻ Bedarf aus Beständen erzeugen'}
    </button>
    <button class="btn-ghost" type="button" disabled={bulking || openItems.length === 0} onclick={bookAllForStore}>
      {bulking ? 'Wird zugewiesen…' : '🛒 Alle in Einkauf legen'}
    </button>
  </div>
  {#if selectedStore}
    <p class="filter-hint">Zeigt Artikel für diesen Markt + Einträge ohne Markt. Kein Mischen mehrerer Märkte.</p>
    {#if listSummary}
      <div class="cost-summary">
        {#if listSummary.totalDepositCents > 0}
          <span class="cost-line-row">Ware {formatEuroApprox(listSummary.totalCents)}</span>
          <span class="cost-line-row cost-line-row--deposit">Pfand {formatEuroApprox(listSummary.totalDepositCents)}</span>
          <span class="cost-total">Summe {formatEuroApprox(listSummary.totalCents + listSummary.totalDepositCents)}</span>
        {:else}
          <span class="cost-total">Einkauf {formatEuroApprox(listSummary.totalCents)}</span>
        {/if}
        {#if listSummary.isPartial}
          <span class="cost-warn">
            ⚠ Schätzung unvollständig{#if listSummary.itemsWithoutPrice > 0}: {listSummary.itemsWithoutPrice} ohne Preis{/if}{#if listSummary.itemsNotComparable > 0}, {listSummary.itemsNotComparable} Einheit nicht vergleichbar{/if}
          </span>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="filter-hint">Markt wählen für Preisschätzung.</p>
  {/if}

  <!-- ── Offene Einträge ─────────────────────────────────────────────────── -->
  <section class="card">
    <h2 class="section-title">Zu kaufen <span class="section-sub">({openItems.length})</span></h2>
    {#if openItems.length === 0}
      <p class="empty-hint">Nichts offen. Bedarf erzeugen oder manuell hinzufügen.</p>
    {:else}
      <ul class="item-list">
        {#each openItems as i (i.id)}
          {@const reserved = i.reservedTripId !== null}
          {@const est = selectedStore && !reserved ? estimateFor(i) : null}
          {@const cheapest = cheapestStoreFor(i.productId)}
          <li class="item" class:item--reserved={reserved}>
            <button class="check" type="button" aria-label="Abhaken" disabled={reserved} onclick={() => toggle(i)}></button>
            <div class="item-main">
              <span class="item-name">{itemName(i)}</span>
              <span class="item-meta">
                {qtyDisplay(i)}
                {#if i.source === 'auto'}<span class="src-badge">auto</span>{/if}
                {#if i.preferredStore}· {i.preferredStore.name}{/if}
                {#if reserved}<span class="res-badge">reserviert · {reservedName(i)}</span>{/if}
                {#if est && est.cents != null}<span class="cost-line">{formatEuroApprox(est.cents)}</span>
                {:else if est && !est.hasPrice}<span class="cost-line cost-line--none">kein Preis</span>
                {:else if est && !est.comparable}<span class="cost-line cost-line--none">Einheit ≠</span>{/if}
                {#if est && est.depositCents > 0}<DepositBadge depositCt={est.depositCents} />{/if}
                {#if cheapest}<span class="cheapest-hint" title="Günstigster Markt pro Basiseinheit">günstigster: {storeName(cheapest)}</span>{/if}
              </span>
            </div>
            <div class="item-actions">
              {#if reserved}
                <a class="btn-book" href={`/einkauf/${i.reservedTripId}`}>Zum Einkauf</a>
                {#if openTrips.filter((t) => t.id !== i.reservedTripId).length > 0}
                  <select
                    class="move-select"
                    aria-label="In anderen Einkauf verschieben"
                    onchange={(e) => { const v = (e.currentTarget as HTMLSelectElement).value; if (v) moveTo(i, v); (e.currentTarget as HTMLSelectElement).value = '' }}
                  >
                    <option value="">→ verschieben…</option>
                    {#each openTrips.filter((t) => t.id !== i.reservedTripId) as t (t.id)}
                      <option value={t.id}>{tripTitle(t)}</option>
                    {/each}
                  </select>
                {/if}
              {:else}
                <button class="btn-book" type="button" onclick={() => bookToTrip(i)}>In Einkauf</button>
                <a class="btn-book btn-book--ghost" href={bookInHref(i)}>Direkt einbuchen</a>
                <button class="btn-x" type="button" aria-label="Entfernen" onclick={() => removeItem(i)}>✕</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}

    <!-- Manueller Eintrag -->
    <div class="add-row">
      <input class="input" type="text" bind:value={newName} placeholder="Eintrag hinzufügen…" maxlength="255"
             onkeydown={(e) => { if (e.key === 'Enter') addItem() }} aria-label="Bezeichnung" />
      <input class="input input--qty" type="number" min="0" step="0.25" bind:value={newQty} aria-label="Menge" />
      <select class="input input--unit" bind:value={newUnit} aria-label="Einheit">
        {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
      </select>
      <button class="btn-primary" type="button" disabled={adding || !newName.trim()} onclick={addItem}>+</button>
    </div>
  </section>

  <!-- ── Erledigt ────────────────────────────────────────────────────────── -->
  {#if checkedItems.length > 0}
    <section class="card">
      <h2 class="section-title">Erledigt <span class="section-sub">({checkedItems.length})</span></h2>
      <ul class="item-list">
        {#each checkedItems as i (i.id)}
          <li class="item item--done">
            <button class="check check--done" type="button" aria-label="Wieder öffnen" onclick={() => toggle(i)}>✓</button>
            <div class="item-main">
              <span class="item-name">{itemName(i)}</span>
              <span class="item-meta">{qtyDisplay(i)}</span>
            </div>
            <div class="item-actions">
              <a class="btn-book" href={bookInHref(i)}>Einbuchen</a>
              <button class="btn-x" type="button" aria-label="Entfernen" onclick={() => removeItem(i)}>✕</button>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>

<style>
  .page { max-width: 720px; margin: 0 auto; padding: var(--space-6) var(--space-4) var(--space-16); }
  .page-header { margin-bottom: var(--space-5); }
  .page-title { font-family: var(--font-display); font-size: var(--text-2xl); font-weight: 700; color: var(--color-text-primary); margin: 0 0 var(--space-2); }
  .page-desc { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0; line-height: 1.6; }

  .alert { padding: var(--space-3) var(--space-4); border-radius: var(--radius-md); font-size: var(--text-sm); margin-bottom: var(--space-4); }
  .alert--error { background: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); }

  .toolbar { margin-bottom: var(--space-4); display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: center; }
  .store-filter { display: inline-flex; align-items: center; gap: var(--space-2); }
  .store-filter-label { font-size: var(--text-sm); color: var(--color-text-muted); }
  .input--store { height: 38px; }
  .filter-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 var(--space-3); }
  .btn-ghost { border: 1px solid var(--color-border); background: transparent; color: var(--color-primary); border-radius: var(--radius-md); height: 38px; padding: 0 var(--space-4); font-size: var(--text-sm); font-weight: 600; cursor: pointer; }
  .btn-ghost:hover:not(:disabled) { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }

  .card { background: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-xl); padding: var(--space-5); margin-bottom: var(--space-5); box-shadow: var(--shadow-sm); }
  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); margin: 0 0 var(--space-4); }
  .section-sub { font-size: var(--text-xs); font-weight: 500; color: var(--color-text-muted); }
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 var(--space-3); }

  .item-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; }
  .item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border-subtle); }
  .item:last-child { border-bottom: none; }
  .item--done { opacity: 0.55; }
  .item--done .item-name { text-decoration: line-through; }
  .item--reserved { opacity: 0.7; background: var(--color-surface-sunken); border-radius: var(--radius-md); }

  .res-badge { background: #fff7ed; color: #c2410c; border: 1px dashed #fdba74; border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: 10px; font-weight: 700; }
  .move-select { height: 28px; border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-surface); color: var(--color-text-secondary); font-size: var(--text-xs); padding: 0 var(--space-1); cursor: pointer; }
  .btn-book--ghost { color: var(--color-text-muted); }
  .btn-book--ghost:hover { color: var(--color-primary); }

  .check { width: 22px; height: 22px; flex-shrink: 0; border: 2px solid var(--color-border-strong, var(--color-border)); border-radius: var(--radius-sm, 6px); background: var(--color-surface); cursor: pointer; }
  .check:hover { border-color: var(--color-primary); }
  .check--done { border-color: var(--color-primary); background: var(--color-primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 13px; }

  .item-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .item-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .item-meta { font-size: var(--text-xs); color: var(--color-text-muted); display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }
  .src-badge { background: var(--color-primary-subtle); color: var(--color-primary); border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: 10px; font-weight: 700; }

  .item-actions { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
  .btn-book { font-size: var(--text-xs); font-weight: 600; color: var(--color-primary); text-decoration: none; border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-1) var(--space-2); }
  .btn-book:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .btn-x { border: none; background: none; color: var(--color-text-muted); cursor: pointer; font-size: 14px; padding: var(--space-1); }
  .btn-x:hover { color: var(--color-danger, #dc2626); }

  .add-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .input { height: 40px; padding: 0 var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--color-border); background: var(--color-surface); color: var(--color-text-primary); font-family: var(--font-body); font-size: var(--text-base); outline: none; box-sizing: border-box; }
  .input:focus { border-color: var(--color-border-focus); box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15); }
  .add-row .input:first-child { flex: 1 1 160px; min-width: 0; }
  .input--qty { flex: 0 1 80px; }
  .input--unit { flex: 0 1 130px; }
  .btn-primary { height: 40px; width: 40px; border: none; background: var(--color-primary); color: var(--color-text-inverse); border-radius: var(--radius-md); font-size: var(--text-lg); font-weight: 700; cursor: pointer; flex-shrink: 0; }
  .btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

  @media (max-width: 560px) {
    .page { padding: var(--space-4) var(--space-3) var(--space-12); }
    .card { padding: var(--space-4); }
    .add-row .input:first-child { flex-basis: 100%; }

    /* Zeile stapeln: Checkbox + Name/Meta oben, Aktionen in eigener Zeile
       darunter (statt neben dem mehrzeiligen Namen -> kein Ineinanderschieben).
       Grid: Spalte 1 = Checkbox (auto), Spalte 2 = Inhalt; Aktionen spannen
       ueber Spalte 2 in die naechste Zeile. */
    .item {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: start;
      column-gap: var(--space-3);
      row-gap: var(--space-2);
      padding: var(--space-3) 0;
    }
    .item-main { grid-column: 2; }
    .item-actions {
      grid-column: 2;
      flex-wrap: wrap;
      justify-content: flex-start;
    }
    /* Buttons in der Aktionszeile duerfen wachsen, damit sie touchbar sind. */
    .item-actions .btn-book { flex: 1 1 auto; text-align: center; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; }
    .item-actions .btn-x { flex: 0 0 auto; min-width: 36px; min-height: 36px; }
    .item-actions .move-select { flex: 1 1 100%; height: 36px; }
  }

  /* ── Kosten-Schätzung (Block F) ───────────────────────────────────────── */
  .cost-summary { display: flex; flex-direction: column; gap: 2px; margin: 0 0 var(--space-4); padding: var(--space-2) var(--space-3); background: var(--color-surface-sunken); border-radius: var(--radius-md); }
  .cost-total { font-size: var(--text-base); font-weight: 700; color: var(--color-text-primary); }
  .cost-warn { font-size: var(--text-xs); color: #c2410c; }
  .cost-line { font-weight: 600; color: var(--color-text-secondary); }
  .cost-line--none { font-weight: 400; color: var(--color-text-muted); font-style: italic; }
  .cheapest-hint { color: var(--color-success, #16a34a); font-size: 11px; font-weight: 600; }
  .cost-line-row { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .cost-line-row--deposit { color: #1d4ed8; font-weight: 600; }
</style>
