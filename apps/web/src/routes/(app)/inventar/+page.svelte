<script lang="ts">
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import { apiFetch } from '$lib/client/api'
  import Modal from '$lib/components/Modal.svelte'
  import ProductForm from '$lib/components/ProductForm.svelte'
  import DepositBadge from '$lib/components/DepositBadge.svelte'
  import type { PageData } from './$types'
  import {
    getExpiryStatus,
    getDaysRemaining,
    getExpiryLabel,
    EXPIRY_CLASS,
  } from '$lib/utils/expiry'
  import { onMount } from 'svelte'
  import { buildUnitMetaMap, isCountUnit } from '$lib/utils/stock'
  import { groupInventoryByProduct } from '$lib/utils/inventory-group'
  import { formatStockTotal } from '$lib/utils/format'
  import { formatRelativeDays } from '$lib/utils/relative-time'

  // ── Types ──────────────────────────────────────────────────────────────────

  type Category = {
    id: string
    name: string
    icon: string | null
    slug: string
  }

  type Place = {
    id: string
    name: string
    storage: {
      id: string
      name: string
      location: {
        id: string
        name: string
      }
    }
  }

  type InventoryItem = {
    id: string
    quantity: string
    unit: string
    bestBeforeDate: string | null
    status: 'available' | 'consumed' | 'expired' | 'donated' | 'discarded'
    consumedAt: string | null
    notes: string | null
    placeId: string | null
    place: Place | null
    product: {
      id: string
      name: string
      brand: string | null
      gtin: string | null
      imageUrl: string | null
      categoryId: string | null
      category: Category | null
      defaultUnit: string | null
      defaultVolumeMl: string | null
      defaultWeightG: string | null
      hasDeposit: boolean
      depositCt: number | null
    }
  }

  type LocationTree = {
    id: string
    name: string
    icon: string | null
    storages: {
      id: string
      name: string
      places: { id: string; name: string }[]
    }[]
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── State ──────────────────────────────────────────────────────────────────
  // svelte-ignore state_referenced_locally
  let items = $state<InventoryItem[]>(data.items as InventoryItem[])
  // svelte-ignore state_referenced_locally
  let locationTree = $state<LocationTree[]>(data.locations as LocationTree[])

  let searchQuery = $state('')
  let filterPlaceId = $state('')
  let filterAvailableOnly = $state(true)

  // Ansichts-Umschalter: 'product' = Bestände je Artikel aggregiert (Default, G39),
  // 'item' = flache Liste einzelner Bestände (bisheriges Verhalten). SSR-sicher mit
  // Default initialisieren, echten localStorage-Wert erst in onMount lesen (kein
  // Hydration-Mismatch). Bei Änderung persistieren.
  let viewMode = $state<'product' | 'item'>('product')

  // Aufgeklappte Artikel-Gruppen (Accordion, Muster aus /orte).
  let openProductIds = $state<Set<string>>(new Set())

  // Einheiten-Meta für die Aggregation (Symbol → UnitMeta). Aus data.units abgeleitet.
  // svelte-ignore state_referenced_locally
  const unitMetaMap = buildUnitMetaMap((data.units as import('$lib/utils/stock').UnitRow[]) ?? [])

  let showSheet = $state(false)

  // Confirm modal state
  let confirmModal = $state<{ open: boolean; title: string; message: string; onConfirm: () => void } | null>(null)

  function showConfirm(title: string, message: string, onConfirm: () => void) {
    confirmModal = { open: true, title, message, onConfirm }
  }

  function closeConfirm() {
    confirmModal = null
  }

  // Menu open state: itemId → boolean
  let openMenuId = $state<string | null>(null)
  // Portal position for the floating context menu
  let menuPosition = $state<{ x: number; y: number } | null>(null)

  // Toast
  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0

  // Categories — initialised from server data, refreshed lazily if needed
  // svelte-ignore state_referenced_locally
  let categories = $state<Category[]>(data.categories as Category[])
  let categoriesLoaded = $state(true)

  // Einheiten-Optionen für die Standard-Einheit (ProductForm).
  // svelte-ignore state_referenced_locally
  const unitOptions = (data.units as { id: string; name: string; symbol: string; dimension?: string | null }[]) ?? []

  // Expiry-Schwellen aus den Haushalts-Einstellungen (statt Hardcodes) — G39.
  // $derived, damit ein invalidateAll die Schwellen mitzieht (reaktivitätssicher).
  const YELLOW_DAYS = $derived(data.expirySettings?.yellowDaysBefore ?? 7)
  const RED_DAYS = $derived(data.expirySettings?.redDaysBefore ?? 2)
  const TOLERANCE_DAYS = $derived(data.expirySettings?.graceDaysAfter ?? 0)

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredItems = $derived(() => {
    let result = items

    if (filterAvailableOnly) {
      result = result.filter((i) => i.status === 'available')
    }

    if (filterPlaceId) {
      result = result.filter((i) => i.placeId === filterPlaceId)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (i) =>
          i.product.name.toLowerCase().includes(q) ||
          (i.product.brand ?? '').toLowerCase().includes(q)
      )
    }

    return result
  })

  // Artikel-Gruppen (Ansicht 'product'): auf Basis der bereits gefilterten Bestände,
  // damit Suche/Ort/„nur verfügbare" auch hier greifen. Ein Artikel erscheint nur,
  // wenn mind. ein Bestand durch den Filter kam; bei „nur verfügbare" fallen 0-Bestand-
  // Artikel automatisch weg (kein Bestand übrig). Aus data-abgeleiteten `items` → $derived.
  const productGroups = $derived(() => groupInventoryByProduct(filteredItems(), unitMetaMap))

  // Anzeige-Zähler: im Artikel-Modus echte Artikelzahl, sonst Bestandszahl.
  // Callable-$derived (wie filteredItems/productGroups), im Markup als displayCount() aufgerufen.
  const displayCount = $derived(() =>
    viewMode === 'product' ? productGroups().length : filteredItems().length
  )

  // All places flat list for filter dropdown
  const allPlaces = $derived(() => {
    const list: { id: string; label: string }[] = []
    for (const loc of locationTree) {
      for (const st of loc.storages) {
        for (const pl of st.places) {
          list.push({ id: pl.id, label: `${loc.name} › ${st.name} › ${pl.name}` })
        }
      }
    }
    return list
  })

  // ── Toast helpers ──────────────────────────────────────────────────────────

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => {
      toasts = toasts.filter((t) => t.id !== id)
    }, 3500)
  }

  // ── Expiry helpers ─────────────────────────────────────────────────────────

  function expiryFromDate(bestBeforeDate: string | null): {
    cssClass: string
    label: string
    hasDate: boolean
  } {
    if (!bestBeforeDate) {
      return { cssClass: 'mhd-none', label: '⚠ Kein MHD', hasDate: false }
    }
    const date = new Date(bestBeforeDate)
    const status = getExpiryStatus(date, TOLERANCE_DAYS, {
      yellowDaysBefore: YELLOW_DAYS,
      redDaysBefore: RED_DAYS,
    })
    const days = getDaysRemaining(date, TOLERANCE_DAYS)
    const label = getExpiryLabel(status, days)
    return { cssClass: EXPIRY_CLASS[status], label, hasDate: true }
  }

  function expiryInfo(item: InventoryItem): {
    cssClass: string
    label: string
    hasDate: boolean
  } {
    return expiryFromDate(item.bestBeforeDate)
  }

  // ── Location breadcrumb ────────────────────────────────────────────────────

  function placeBreadcrumb(item: InventoryItem): string {
    if (!item.place) return ''
    return `${item.place.storage.location.name} › ${item.place.storage.name} › ${item.place.name}`
  }

  // ── Unit display ───────────────────────────────────────────────────────────

  function unitLabel(unit: string): string {
    const map: Record<string, string> = {
      piece: 'Stück',
      g: 'g',
      kg: 'kg',
      ml: 'ml',
      l: 'l',
    }
    return map[unit] ?? unit
  }

  function quantityDisplay(item: InventoryItem): string {
    const qty = parseFloat(item.quantity)
    const unit = unitLabel(item.unit)
    return `${qty % 1 === 0 ? qty.toFixed(0) : qty} ${unit}`
  }

  // ── Category icon ──────────────────────────────────────────────────────────

  const CATEGORY_ICONS: Record<string, string> = {
    getraenke: '🧃',
    milchprodukte: '🥛',
    fleisch: '🥩',
    gemuese: '🥦',
    obst: '🍎',
    brot: '🍞',
    snacks: '🍿',
    tiefkuehl: '🧊',
    konserven: '🥫',
    gewuerze: '🧂',
    suesses: '🍫',
    sonstiges: '📦',
  }

  function categoryIcon(item: InventoryItem): string {
    return categoryIconForProduct(item.product)
  }

  // Icon aus einem Produkt (für die Artikel-Karte, die kein Item hat).
  function categoryIconForProduct(product: { category: Category | null }): string {
    if (product.category?.icon) return product.category.icon
    const slug = product.category?.slug ?? ''
    for (const [key, icon] of Object.entries(CATEGORY_ICONS)) {
      if (slug.includes(key)) return icon
    }
    return '📦'
  }

  // ── Load categories ────────────────────────────────────────────────────────

  async function loadCategories() {
    if (categoriesLoaded) return
    const res = await apiFetch('/api/categories')
    if (res.ok) categories = await res.json()
    categoriesLoaded = true
  }

  // ── Add sheet (Neuer Artikel — gemeinsame ProductForm, G11) ─────────────────

  async function openAddSheet() {
    await loadCategories()
    showSheet = true
  }

  function closeSheet() {
    showSheet = false
  }

  function onProductCreated() {
    showSheet = false
    showToast('Artikel angelegt — Bestand über „Bestand hinzufügen"')
  }

  // ── Consume item ───────────────────────────────────────────────────────────

  async function consumeItem(item: InventoryItem) {
    closeMenu()
    try {
      const res = await apiFetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'consumed' }),
      })
      if (!res.ok) throw new Error(await res.text())
      // consumedAt spiegelt der Server jetzt automatisch (G41) — optimistisch mitsetzen.
      const now = new Date().toISOString()
      items = items.map((i) => (i.id === item.id ? { ...i, status: 'consumed', consumedAt: now } : i))
      showToast(`"${item.product.name}" als verbraucht markiert`)
    } catch {
      showToast('Fehler', 'error')
    }
  }

  // Status-Änderung (Spenden / Entsorgen) — analog consume, aber anderer Zielstatus.
  async function setItemStatus(item: InventoryItem, status: 'donated' | 'discarded', label: string) {
    closeMenu()
    try {
      const res = await apiFetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error(await res.text())
      const now = new Date().toISOString()
      items = items.map((i) => (i.id === item.id ? { ...i, status, consumedAt: now } : i))
      showToast(`"${item.product.name}" ${label}`)
    } catch {
      showToast('Fehler', 'error')
    }
  }

  // Wiederherstellen (G41/G43): nicht-verfügbaren Bestand zurück auf 'available'. Ist die Menge 0
  // (z.B. beim Verbrauchen geleert), wird die Menge über ein stoqr-Modal abgefragt. Server nullt consumedAt.
  let restoreModal = $state<{ item: InventoryItem; qty: string } | null>(null)

  function restoreItem(item: InventoryItem) {
    closeMenu()
    if (parseFloat(item.quantity) <= 0) {
      restoreModal = { item, qty: '1' }
      return
    }
    void doRestoreItem(item)
  }

  function confirmRestoreModal() {
    if (!restoreModal) return
    const qty = Number(String(restoreModal.qty).replace(',', '.'))
    if (isNaN(qty) || qty <= 0) { showToast('Ungültige Menge', 'error'); return }
    const item = restoreModal.item
    restoreModal = null
    void doRestoreItem(item, String(qty))
  }

  async function doRestoreItem(item: InventoryItem, quantity?: string) {
    const body: { status: 'available'; quantity?: string } = { status: 'available' }
    if (quantity) body.quantity = quantity
    try {
      const res = await apiFetch(`/api/inventory/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(await res.text())
      items = items.map((i) =>
        i.id === item.id
          ? { ...i, status: 'available', consumedAt: null, quantity: body.quantity ?? i.quantity }
          : i
      )
      showToast(`"${item.product.name}" wiederhergestellt`)
    } catch {
      showToast('Fehler', 'error')
    }
  }

  // ── Delete item ────────────────────────────────────────────────────────────

  async function deleteItem(item: InventoryItem) {
    closeMenu()
    showConfirm(
      'Bestandseintrag entfernen?',
      `"${item.product.name}" wird aus dem Inventar entfernt.
Das Produkt bleibt im Katalog.`,
      async () => {
        closeConfirm()
        try {
          const res = await apiFetch(`/api/inventory/${item.id}`, { method: 'DELETE' })
          if (!res.ok) throw new Error(await res.text())
          items = items.filter((i) => i.id !== item.id)
          showToast(`"${item.product.name}" aus Inventar entfernt`)
        } catch {
          showToast('Fehler beim Entfernen', 'error')
        }
      }
    )
  }

    // ── Menu toggle ────────────────────────────────────────────────────────────

  function openMenu(itemId: string, event: MouseEvent) {
    const btn = event.currentTarget as HTMLElement
    const rect = btn.getBoundingClientRect()
    menuPosition = { x: rect.right - 180, y: rect.bottom + 4 }
    openMenuId = itemId
    event.stopPropagation()
  }

  function closeMenu() {
    openMenuId = null
    menuPosition = null
  }

  // ── Ansichts-Umschalter + Accordion (G39) ───────────────────────────────────

  const VIEW_STORAGE_KEY = 'stoqr:inventar:viewMode'

  onMount(() => {
    // Gemerkte Ansicht erst clientseitig laden (SSR-Default bleibt 'product').
    const stored = localStorage.getItem(VIEW_STORAGE_KEY)
    if (stored === 'product' || stored === 'item') viewMode = stored
  })

  function setViewMode(mode: 'product' | 'item') {
    viewMode = mode
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode)
    } catch {
      // localStorage kann in Privatmodus fehlen — Wahl gilt dann nur für die Session.
    }
  }

  function toggleProduct(id: string) {
    const next = new Set(openProductIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    openProductIds = next
  }
</script>

<!-- Click outside / scroll to close menus -->
<svelte:window onclick={closeMenu} onscroll={closeMenu} />

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">
  <!-- Header -->
  <div class="page-header">
    <h1 class="page-title">Inventar</h1>
    <span class="item-count">{displayCount()} {viewMode === 'product' ? 'Artikel' : 'Bestände'}</span>
  </div>

  <!-- Ansichts-Umschalter (Artikel ↔ Bestände) -->
  <div class="view-toggle" role="group" aria-label="Ansicht wählen">
    <button
      type="button"
      class="view-toggle-btn"
      class:active={viewMode === 'product'}
      aria-pressed={viewMode === 'product'}
      onclick={() => setViewMode('product')}
    >
      Nach Artikel
    </button>
    <button
      type="button"
      class="view-toggle-btn"
      class:active={viewMode === 'item'}
      aria-pressed={viewMode === 'item'}
      onclick={() => setViewMode('item')}
    >
      Einzelbestände
    </button>
  </div>

  <!-- Search bar -->
  <div class="search-wrap">
    <svg class="search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <input
      class="search-input"
      type="search"
      placeholder="Produkt suchen…"
      bind:value={searchQuery}
      aria-label="Inventar durchsuchen"
    />
  </div>

  <!-- Filter row -->
  <div class="filter-row">
    <select
      class="filter-select"
      bind:value={filterPlaceId}
      aria-label="Lagerplatz filtern"
    >
      <option value="">Alle Lagerplätze</option>
      {#each allPlaces() as place (place.id)}
        <option value={place.id}>{place.label}</option>
      {/each}
    </select>

    <label class="filter-toggle">
      <input
        type="checkbox"
        bind:checked={filterAvailableOnly}
        aria-label="Nur verfügbare anzeigen"
      />
      <span class="toggle-track">
        <span class="toggle-thumb"></span>
      </span>
      <span class="toggle-label">Nur verfügbare</span>
    </label>
  </div>

  <!-- Item grid / empty state -->
  {#if displayCount() === 0}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
          <rect width="72" height="72" rx="16" fill="var(--color-primary-subtle)"/>
          <rect x="20" y="22" width="32" height="28" rx="4" stroke="var(--color-primary)" stroke-width="2.5" fill="none"/>
          <path d="M28 34h16M28 40h10" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
          <path d="M28 28h16" stroke="var(--color-primary)" stroke-width="2.5" stroke-linecap="round"/>
        </svg>
      </div>
      {#if searchQuery || filterPlaceId}
        <p class="empty-title">Keine Treffer</p>
        <p class="empty-sub">Passe die Filter an oder entferne den Suchbegriff.</p>
        <button
          class="btn-secondary"
          type="button"
          onclick={() => { searchQuery = ''; filterPlaceId = '' }}
        >Filter zurücksetzen</button>
      {:else}
        <p class="empty-title">Noch nichts im Inventar</p>
        <p class="empty-sub">Füge dein erstes Produkt hinzu, um den Überblick zu behalten.</p>
        <button class="btn-primary btn-primary--lg" type="button" onclick={openAddSheet}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          Erstes Produkt hinzufügen
        </button>
      {/if}
    </div>
  {:else if viewMode === 'item'}
    <ul class="item-grid" role="list">
      {#each filteredItems() as item (item.id)}
        {@const expiry = expiryInfo(item)}
        {@const breadcrumb = placeBreadcrumb(item)}
        {@const icon = categoryIcon(item)}
        <li class="item-card" class:item-card--consumed={item.status !== 'available'}>
          <!-- Klick auf die Card oeffnet die Artikelseite OHNE Deeplink-Scroll (?scroll=0).
               Overlay-Link statt verschachtelter Interaktiv-Elemente; das 3-Punkte-Menue
               liegt per z-index darueber und bleibt separat klickbar. -->
          <a
            class="item-card-overlay"
            href="/inventar/{item.id}?scroll=0"
            aria-label="Artikel öffnen: {item.product.name}"
          ></a>
          <!-- Image / icon area -->
          <div class="item-thumb">
            {#if item.product.imageUrl}
              <img
                src={item.product.imageUrl}
                alt={item.product.name}
                class="item-image"
                loading="lazy"
                onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            {:else}
              <span class="item-cat-icon" aria-hidden="true">{icon}</span>
            {/if}
          </div>

          <!-- Content -->
          <div class="item-body">
            <div class="item-name-row">
              <span class="item-name">{item.product.name}</span>
              <!-- Three-dot menu -->
              <div class="menu-wrap">
                <button
                  class="btn-dots"
                  type="button"
                  aria-label="Optionen"
                  aria-expanded={openMenuId === item.id}
                  onclick={(e) => openMenu(item.id, e)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="3" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="8" r="1.2" fill="currentColor"/>
                    <circle cx="8" cy="13" r="1.2" fill="currentColor"/>
                  </svg>
                </button>
              </div>
            </div>

            {#if item.product.brand}
              <span class="item-brand">{item.product.brand}</span>
            {/if}

            {#if item.product.gtin}
              <span class="item-ean">EAN {item.product.gtin}</span>
            {/if}

            {#if item.product.hasDeposit && isCountUnit(item.product.defaultUnit, unitMetaMap)}
              <DepositBadge depositCt={item.product.depositCt} />
            {/if}

            <!-- MHD badge -->
            {#if expiry.hasDate}
              <span class="mhd-badge {expiry.cssClass}">{expiry.label}</span>
            {:else}
              <span class="mhd-badge mhd-none">{expiry.label}</span>
            {/if}

            <!-- Breadcrumb -->
            {#if breadcrumb}
              <span class="item-breadcrumb">{breadcrumb}</span>
            {/if}

            <!-- Footer: quantity + status -->
            <div class="item-footer">
              <span class="item-qty">{quantityDisplay(item)}</span>
              {#if item.status !== 'available'}
                <span class="status-badge status-badge--{item.status}">
                  {item.status === 'consumed'
                    ? 'Verbraucht'
                    : item.status === 'expired'
                      ? 'Abgelaufen'
                      : item.status === 'donated'
                        ? 'Gespendet'
                        : 'Entsorgt'}
                  {#if item.consumedAt}
                    <span class="status-when"> · {formatRelativeDays(item.consumedAt)}</span>
                  {/if}
                </span>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <!-- Artikel-Ansicht: Bestände je Artikel aggregiert (Accordion) -->
    <ul class="product-list" role="list">
      {#each productGroups() as group (group.product.id)}
        {@const open = openProductIds.has(group.product.id)}
        {@const icon = categoryIconForProduct(group.product)}
        {@const mhd = expiryFromDate(group.earliestBestBefore)}
        <li class="product-card">
          <button
            class="accordion-toggle"
            type="button"
            aria-expanded={open}
            onclick={() => toggleProduct(group.product.id)}
          >
            <span class="product-thumb" aria-hidden="true">
              {#if group.product.imageUrl}
                <img
                  src={group.product.imageUrl}
                  alt=""
                  class="product-thumb-img"
                  loading="lazy"
                  onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
                />
              {:else}
                <span class="product-cat-icon">{icon}</span>
              {/if}
            </span>
            <span class="product-main">
              <span class="product-name">{group.product.name}</span>
              {#if group.product.gtin}
                <span class="item-ean">EAN {group.product.gtin}</span>
              {/if}
              <span class="product-meta">
                <span class="product-total">{formatStockTotal(group.totals)}</span>
                <span class="product-badge" title="Anzahl Bestände">{group.availableCount}×</span>
                {#if mhd.hasDate}
                  <span class="mhd-badge {mhd.cssClass}">{mhd.label}</span>
                {/if}
                {#if group.product.hasDeposit && isCountUnit(group.product.defaultUnit, unitMetaMap)}
                  <DepositBadge depositCt={group.product.depositCt} />
                {/if}
              </span>
            </span>
            <svg
              class="chevron"
              class:open
              width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          {#if open}
            <ul class="product-body" role="list">
              <li class="stock-row stock-row--overview">
                <a
                  class="stock-row-link article-overview-link"
                  href="/inventar/{group.items[0].id}?scroll=0"
                >
                  <span class="article-overview-label">Zur Artikelübersicht</span>
                  <svg
                    class="article-overview-arrow"
                    width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                  >
                    <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </a>
              </li>
              {#each group.items as item (item.id)}
                {@const expiry = expiryInfo(item)}
                {@const breadcrumb = placeBreadcrumb(item)}
                <li class="stock-row" class:stock-row--consumed={item.status !== 'available'}>
                  <a class="stock-row-link" href="/inventar/{item.id}">
                    <span class="stock-row-qty">{quantityDisplay(item)}</span>
                    {#if expiry.hasDate}
                      <span class="mhd-badge {expiry.cssClass}">{expiry.label}</span>
                    {:else}
                      <span class="mhd-badge mhd-none">{expiry.label}</span>
                    {/if}
                    {#if breadcrumb}
                      <span class="stock-row-place">{breadcrumb}</span>
                    {/if}
                    {#if item.status !== 'available'}
                      <span class="status-badge status-badge--{item.status}">
                        {item.status === 'consumed'
                          ? 'Verbraucht'
                          : item.status === 'expired'
                            ? 'Abgelaufen'
                            : item.status === 'donated'
                              ? 'Gespendet'
                              : 'Entsorgt'}
                        {#if item.consumedAt}
                          <span class="status-when"> · {formatRelativeDays(item.consumedAt)}</span>
                        {/if}
                      </span>
                    {/if}
                  </a>
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- ── Floating context menu portal ──────────────────────────────────────── -->

{#if openMenuId && menuPosition}
  {@const portalItem = items.find((i) => i.id === openMenuId)}
  {#if portalItem}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="context-menu-portal"
      style="top: {menuPosition.y}px; left: {menuPosition.x}px"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
    >
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <ul role="menu" style="list-style:none;margin:0;padding:var(--space-1)">
        <li role="menuitem">
          <a
            class="dropdown-item"
            href="/inventar/{portalItem.id}?scroll=0"
            onclick={() => closeMenu()}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Zur Artikelübersicht
          </a>
        </li>
        <li role="menuitem">
          <a
            class="dropdown-item"
            href="/inventar/easy-add?productId={portalItem.product.id}&productName={encodeURIComponent(portalItem.product.name)}"
            onclick={() => closeMenu()}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="1" width="12" height="12" rx="2.5" stroke="currentColor" stroke-width="1.4" fill="none"/>
              <path d="M7 4v6M4 7h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            Bestand hinzufügen
          </a>
        </li>
        {#if portalItem.status === 'available'}
          <li role="menuitem">
            <button
              class="dropdown-item"
              type="button"
              onclick={() => { const it = portalItem; closeMenu(); if (it) consumeItem(it) }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Verbraucht
            </button>
          </li>
          <li role="menuitem">
            <button
              class="dropdown-item"
              type="button"
              onclick={() => { const it = portalItem; if (it) setItemStatus(it, 'donated', 'als gespendet markiert') }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M7 12s-5-3.3-5-6.5A2.5 2.5 0 0 1 7 4a2.5 2.5 0 0 1 5 1.5C12 8.7 7 12 7 12Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
              </svg>
              Gespendet
            </button>
          </li>
          <li role="menuitem">
            <button
              class="dropdown-item"
              type="button"
              onclick={() => { const it = portalItem; if (it) setItemStatus(it, 'discarded', 'als entsorgt markiert') }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 4h10M5 4V3h4v1M4.5 4v7h5V4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Entsorgt
            </button>
          </li>
        {:else}
          <li role="menuitem">
            <button
              class="dropdown-item"
              type="button"
              onclick={() => { const it = portalItem; if (it) restoreItem(it) }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 7a5 5 0 1 1 1.5 3.5M2 7V4M2 7h3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              Wiederherstellen
            </button>
          </li>
        {/if}
        <li role="menuitem">
          <button
            class="dropdown-item dropdown-item--danger"
            type="button"
            onclick={() => {
              const it = portalItem
              closeMenu()
              if (!it) return
              showConfirm(
                'Produkt aus Katalog entfernen?',
                `"${it.product.name}" wird aus dem Katalog entfernt. Bestandseinträge bleiben erhalten.`,
                async () => {
                  closeConfirm()
                  try {
                    const res = await apiFetch(`/api/products/${it.product.id}`, { method: 'DELETE' })
                    if (!res.ok) {
                      const body = await res.json().catch(() => ({}))
                      showToast(body.error ?? 'Fehler beim Entfernen', 'error')
                      return
                    }
                    showToast(`"${it.product.name}" aus Katalog entfernt`)
                  } catch { showToast('Fehler beim Entfernen', 'error') }
                },
                'Aus Katalog entfernen'
              )
            }}
            title="Produkt aus dem Katalog entfernen (Bestand bleibt)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5.5" stroke="currentColor" stroke-width="1.4"/>
              <path d="M4.5 7h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            Aus Katalog entfernen
          </button>
        </li>
        <li role="menuitem">
          <button
            class="dropdown-item dropdown-item--danger"
            type="button"
            onclick={() => { const it = portalItem; closeMenu(); if (it) deleteItem(it) }}
            title="Entfernt diesen Bestandseintrag. Das Produkt bleibt im Katalog."
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 3.5V11h4V3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Aus Inventar entfernen
          </button>
        </li>
        <li role="menuitem">
          <button
            class="dropdown-item dropdown-item--danger"
            type="button"
            onclick={() => {
              const it = portalItem
              closeMenu()
              if (!it) return
              showConfirm(
                'Artikel vollständig löschen?',
                `Produkt, alle Bestandseinträge und Bezugsquellen von "${it.product.name}" werden dauerhaft gelöscht.`,
                async () => {
                  closeConfirm()
                  try {
                    await apiFetch(`/api/products/${it.product.id}`, { method: 'DELETE' })
                    items = items.filter(i => i.product.id !== it.product.id)
                    showToast(`"${it.product.name}" gelöscht`)
                  } catch { showToast('Fehler beim Löschen', 'error') }
                },
                'Alles löschen'
              )
            }}
            title="Artikel vollständig mit allen Bezügen dauerhaft löschen"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 3.5h12M4.5 3.5V2.5h5V3.5M3.5 3.5L4 11h6l.5-7.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M5.5 6v3M8.5 6v3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            Alles löschen
          </button>
        </li>
      </ul>
    </div>
  {/if}
{/if}

<!-- ── FAB group ──────────────────────────────────────────────────────────── -->

<div class="fab-group">
  <a class="fab-secondary" href="/inventar/easy-add" aria-label="Bestand hinzufügen">
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.6"/>
      <path d="M9 6v6M6 9h6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    </svg>
    <span class="fab-label">Bestand hinzufügen</span>
  </a>
  <button class="fab" type="button" aria-label="Neuer Artikel" onclick={openAddSheet}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg>
    <span class="fab-label">Neuer Artikel</span>
  </button>
</div>

<!-- ── Neuer Artikel (gemeinsame ProductForm, G11) ────────────────────────── -->

<ProductForm
  open={showSheet}
  product={null}
  {categories}
  units={unitOptions}
  onSaved={onProductCreated}
  onClose={closeSheet}
/>

<!-- ── Confirm Modal ────────────────────────────────────────────────────── -->
{#if confirmModal}
  <ConfirmModal
    open={confirmModal.open}
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel="Entfernen"
    destructive={true}
    onConfirm={confirmModal.onConfirm}
    onCancel={closeConfirm}
  />
{/if}

<!-- ── Bestand wiederherstellen: Mengen-Abfrage (Menge 0, G43) ─────────────── -->
<Modal open={restoreModal !== null} title="Bestand wiederherstellen" size="sm" onClose={() => (restoreModal = null)}>
  {#if restoreModal}
    <p class="restore-hint">„{restoreModal.item.product.name}" hat keine Menge mehr. Gib die Menge an, mit der wiederhergestellt werden soll.</p>
    <label class="restore-field">
      <span class="restore-label">Menge</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={restoreModal.qty} />
    </label>
  {/if}
  {#snippet footer()}
    <button class="btn-secondary" type="button" onclick={() => (restoreModal = null)}>Abbrechen</button>
    <button class="btn-primary" type="button" onclick={confirmRestoreModal}>Wiederherstellen</button>
  {/snippet}
</Modal>

<!-- ── Toast container ───────────────────────────────────────────────────── -->

{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class="toast" class:toast--error={toast.type === 'error'}>
        {#if toast.type === 'success'}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        {:else}
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        {/if}
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 1100px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) calc(var(--space-8) + 80px);
  }

  .page-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  .item-count {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-weight: 500;
  }

  /* ── Search ───────────────────────────────────────────────────────────── */

  .search-wrap {
    position: relative;
    margin-bottom: var(--space-3);
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 42px;
    padding: 0 var(--space-3) 0 calc(var(--space-3) * 2 + 16px);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    box-sizing: border-box;
  }

  .search-input::placeholder { color: var(--color-text-muted); }

  .search-input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  /* ── Filter row ───────────────────────────────────────────────────────── */

  .filter-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    flex-wrap: wrap;
  }

  .filter-select {
    height: 36px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    outline: none;
    cursor: pointer;
    transition: border-color var(--transition-fast);
    min-width: 180px;
    max-width: 280px;
  }

  .filter-select:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  /* Toggle */
  .filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    user-select: none;
  }

  .filter-toggle input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-track {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 36px;
    height: 20px;
    border-radius: var(--radius-full);
    background-color: var(--color-border);
    transition: background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .filter-toggle input:checked ~ .toggle-track {
    background-color: var(--color-primary);
  }

  .toggle-thumb {
    position: absolute;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: white;
    box-shadow: var(--shadow-sm);
    transition: transform var(--transition-fast);
  }

  .filter-toggle input:checked ~ .toggle-track .toggle-thumb {
    transform: translateX(16px);
  }

  .toggle-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  /* ── View toggle (Artikel ↔ Bestände) ─────────────────────────────────── */

  .view-toggle {
    display: inline-flex;
    padding: 3px;
    gap: 2px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    margin-bottom: var(--space-4);
  }

  .view-toggle-btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    padding: var(--space-1) var(--space-4);
    border-radius: calc(var(--radius-md) - 2px);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
  }

  .view-toggle-btn:hover {
    color: var(--color-text-primary);
  }

  .view-toggle-btn.active {
    background-color: var(--color-surface-raised);
    color: var(--color-text-primary);
    box-shadow: var(--shadow-sm);
  }

  /* ── Product (Artikel) accordion ───────────────────────────────────────── */

  .product-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .product-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  .accordion-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    transition: background-color var(--transition-fast);
  }

  .accordion-toggle:hover {
    background-color: var(--color-surface-sunken);
  }

  .product-thumb {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    overflow: hidden;
    flex-shrink: 0;
  }

  .product-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .product-cat-icon {
    font-size: 1.4rem;
    line-height: 1;
  }

  .product-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .product-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .product-meta {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .product-total {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-primary);
  }

  .product-badge {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    font-size: 10px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform var(--transition-base);
    margin-left: auto;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .product-body {
    list-style: none;
    margin: 0;
    padding: 0 var(--space-3) var(--space-2);
    border-top: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
  }

  .stock-row {
    border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
  }

  .stock-row:last-child {
    border-bottom: none;
  }

  .stock-row--consumed {
    opacity: 0.6;
  }

  .stock-row-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    text-decoration: none;
    color: inherit;
    flex-wrap: wrap;
  }

  .stock-row-link:hover .stock-row-qty {
    color: var(--color-primary);
  }

  .stock-row-qty {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-primary);
    min-width: 64px;
  }

  .stock-row-place {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }

  /* "Zur Artikelübersicht" — dezente Kopfzeile ueber den Beständen im aufgeklappten
     Accordion. Fuehrt zur Artikelseite OHNE Deeplink-Scroll (?scroll=0). */
  .stock-row--overview {
    border-bottom: 1px solid var(--color-border);
  }

  .article-overview-link {
    justify-content: space-between;
    color: var(--color-primary);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .article-overview-label {
    flex: 1;
  }

  .article-overview-arrow {
    flex-shrink: 0;
    transition: transform var(--transition-fast);
  }

  .article-overview-link:hover .article-overview-arrow {
    transform: translateX(2px);
  }

  /* ── Item grid ────────────────────────────────────────────────────────── */

  .item-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  @media (min-width: 640px) {
    .item-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (min-width: 1024px) {
    .item-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ── Item card ────────────────────────────────────────────────────────── */

  .item-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    /* overflow: hidden removed — it clips the dropdown menu */
    overflow: visible;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--transition-fast), transform var(--transition-fast);
    position: relative;
  }

  .item-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .item-card--consumed {
    opacity: 0.6;
  }

  /* Ganzflaechiger Klick-Link: oeffnet die Artikelseite OHNE Deeplink-Scroll.
     Liegt unter dem 3-Punkte-Menue (z-index), damit dieses separat klickbar bleibt. */
  .item-card-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: var(--radius-lg);
  }

  /* Thumb */
  .item-thumb {
    aspect-ratio: 1;
    background-color: var(--color-surface-sunken);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
    /* Round top corners to compensate for overflow:visible on .item-card */
    border-radius: calc(var(--radius-lg) - 1px) calc(var(--radius-lg) - 1px) 0 0;
  }

  .item-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .item-cat-icon {
    font-size: 2.2rem;
    line-height: 1;
  }

  /* Body */
  .item-body {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
  }

  .item-name-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .item-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    flex: 1;
    line-height: 1.35;
    /* Immer Platz fuer 2 Zeilen reservieren, damit 1- vs. 2-zeilige Namen die
       Kartenhoehe nicht springen lassen (G14-4). */
    min-height: 2.7em;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .item-brand {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .item-ean {
    font-size: 11px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }

  .item-breadcrumb {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    margin-top: auto;
    padding-top: var(--space-1);
  }

  .item-qty {
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--color-text-primary);
  }

  /* ── MHD badge ────────────────────────────────────────────────────────── */

  :global(.mhd-badge) {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 600;
    width: fit-content;
    white-space: nowrap;
  }

  :global(.mhd-badge.mhd-fresh) {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  :global(.mhd-badge.mhd-ok) {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  :global(.mhd-badge.mhd-soon) {
    background-color: #fef9c3;
    color: #a16207;
  }

  :global(.mhd-badge.mhd-critical) {
    background-color: #fee2e2;
    color: var(--color-danger, #dc2626);
  }

  :global(.mhd-badge.mhd-expired) {
    background-color: #fce7f3;
    color: #9d174d;
  }

  /* Bestand ohne MHD: neutral-auffällig (Handlungsbedarf, nicht 'frisch') */
  :global(.mhd-badge.mhd-none) {
    background-color: #fff7ed;
    color: #c2410c;
    border: 1px dashed #fdba74;
  }

  /* ── Status badge ─────────────────────────────────────────────────────── */

  .status-badge {
    display: inline-flex;
    align-items: center;
    height: 18px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
  }

  /* „· vor 3 Tagen" (G41): dezenter Zusatz im Status-Badge */
  .status-when {
    font-weight: 500;
    opacity: 0.75;
  }

  .status-badge--consumed {
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
  }

  .status-badge--expired {
    background-color: #fee2e2;
    color: var(--color-danger, #dc2626);
  }

  .status-badge--donated,
  .status-badge--discarded {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  /* ── Three-dot menu ───────────────────────────────────────────────────── */

  .menu-wrap {
    position: relative;
    flex-shrink: 0;
    z-index: 2;
  }

  .btn-dots {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-dots:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .dropdown {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: var(--z-dropdown, 200);
    min-width: 148px;
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    overflow: hidden;
  }

  /* ── Context menu portal (position:fixed, escapes card stacking context) ── */

  .context-menu-portal {
    position: fixed;
    z-index: var(--z-modal, 400);
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    min-width: 180px;
    overflow: hidden;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background-color: transparent;
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    border-radius: var(--radius-md);
    text-align: left;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    white-space: nowrap;
  }

  .dropdown-item:hover {
    background-color: var(--color-surface-sunken);
  }

  .dropdown-item--danger {
    color: var(--color-danger, #dc2626);
  }

  .dropdown-item--danger:hover {
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Empty state ──────────────────────────────────────────────────────── */

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4);
    padding: var(--space-16) var(--space-6);
    text-align: center;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
  }

  .empty-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0;
    max-width: 320px;
    line-height: 1.6;
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary--lg {
    height: 44px;
    padding: 0 var(--space-6);
    font-size: var(--text-base);
  }

  .btn-secondary {
    display: inline-flex;
    align-items: center;
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-secondary:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  /* ── FAB group ────────────────────────────────────────────────────────── */

  .fab-group {
    position: fixed;
    bottom: calc(var(--space-6) + env(safe-area-inset-bottom, 0px));
    right: var(--space-6);
    z-index: var(--z-fab, 100);
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .fab-secondary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 48px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-full);
    background-color: var(--color-surface-raised);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--color-border);
    white-space: nowrap;
    flex-shrink: 0;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
  }

  .fab-secondary:hover {
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    border-color: var(--color-primary);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .fab-secondary:active {
    transform: scale(0.97);
  }

  /* ── FAB ──────────────────────────────────────────────────────────────── */

  .fab {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 48px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-full);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    cursor: pointer;
    box-shadow: var(--shadow-lg);
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .fab-label {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .fab:hover {
    background-color: var(--color-primary-hover);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    transform: scale(1.03);
  }

  .fab:active {
    transform: scale(0.97);
  }

  .btn-save-sheet {
    width: 100%;
    height: 44px;
    justify-content: center;
    font-size: var(--text-base);
  }

  /* ── Form fields ──────────────────────────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .required { color: var(--color-danger, #dc2626); }

  .input {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    width: 100%;
    box-sizing: border-box;
    appearance: none;
  }

  .input::placeholder { color: var(--color-text-muted); }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .article-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  /* ── Restore-Mengen-Modal (G43) ───────────────────────────────────────── */
  .restore-hint {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
    margin: 0 0 var(--space-3);
  }
  .restore-field { display: flex; flex-direction: column; gap: var(--space-1); }
  .restore-label { font-size: var(--text-xs); color: var(--color-text-muted); }

  /* ── Spinner ──────────────────────────────────────────────────────────── */

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Toast ────────────────────────────────────────────────────────────── */

  .toast-container {
    position: fixed;
    bottom: calc(var(--space-6) + 64px);
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-toast, 600);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    align-items: center;
    pointer-events: none;
  }

  .toast {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background-color: var(--color-accent);
    color: var(--color-text-inverse);
    font-size: var(--text-sm);
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    white-space: nowrap;
    animation: toast-in 200ms ease;
  }

  .toast--error {
    background-color: var(--color-danger, #dc2626);
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* ── Mobile ───────────────────────────────────────────────────────────── */

  /* FAB-Labels bereits ab Tablet-Breite ausblenden, damit die beiden FABs im
     Bereich 481–680px nicht ueber den Rand laufen. Beide werden gleich grosse
     runde Icon-Buttons. */
  @media (max-width: 680px) {
    .fab-label {
      display: none;
    }
    .fab-secondary,
    .fab {
      width: 56px;
      height: 56px;
      padding: 0;
      justify-content: center;
    }
  }

  @media (max-width: 480px) {
    .page {
      padding: var(--space-5) var(--space-3) calc(var(--space-5) + 80px);
    }

    .item-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
    }

    .filter-row {
      gap: var(--space-2);
    }

    .filter-select {
      min-width: 0;
      flex: 1;
    }

    .fab-group {
      right: var(--space-4);
      bottom: calc(var(--space-4) + env(safe-area-inset-bottom, 0px));
    }

    .toast-container {
      bottom: calc(var(--space-4) + 64px);
      left: var(--space-4);
      right: var(--space-4);
      transform: none;
    }

    .toast {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 360px) {
    .item-grid {
      grid-template-columns: 1fr;
    }
  }

  /* ── Form sections ────────────────────────────────────────────────────── */

  .form-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
</style>
