<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { toast } from '$lib/stores/toast'
  import AddressAutocomplete from '$lib/components/AddressAutocomplete.svelte'
  import type { GeoSuggestion } from '$lib/utils/geo'

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Store list state ────────────────────────────────────────────────────────

  type Store = {
    id: string
    name: string
    chain: string | null
    address: string | null
    city: string | null
    latitude: string | null
    longitude: string | null
    scrapeUrl: string | null
  }

  // svelte-ignore state_referenced_locally
  let storeRows = $state<Store[]>(data.stores as Store[])
  // svelte-ignore state_referenced_locally
  let pageLoadError = $state<string | null>(data.loadError ?? null)
  // svelte-ignore state_referenced_locally
  const priceScrapeEnabled = data.priceScrapeEnabled ?? false

  // ── Add form state ─────────────────────────────────────────────────────────

  let newName = $state('')
  let newChain = $state('')
  let newAddress = $state('')
  let newCity = $state('')
  let newLat = $state<string | null>(null)
  let newLon = $state<string | null>(null)
  let newScrapeUrl = $state('')
  let adding = $state(false)
  let addError = $state<string | null>(null)

  // ── Inline edit state ──────────────────────────────────────────────────────

  let editingId = $state<string | null>(null)
  let editingName = $state('')
  let editingChain = $state('')
  let editingAddress = $state('')
  let editingCity = $state('')
  let editingLat = $state<string | null>(null)
  let editingLon = $state<string | null>(null)
  let editingScrapeUrl = $state('')
  let editSaving = $state(false)
  let editError = $state<string | null>(null)

  // ── Delete state ──────────────────────────────────────────────────────────

  let deleting = $state<string | null>(null)

  // ── Sammel-Abruf state ──────────────────────────────────────────────────────

  let fetchingAll = $state<string | null>(null)
  // Ergebnis des letzten Sammel-Abrufs je Markt — welche Artikel warum
  // uebersprungen/fehlgeschlagen sind (G11-3 Transparenz).
  type SkipReason = 'no_url' | 'no_gtin' | 'no_match' | 'error'
  type SkipItem = { id: string; name: string; gtin: string | null; reason: SkipReason }
  let fetchResults = $state<Record<string, { skippedItems: SkipItem[]; failedItems: SkipItem[] }>>({})

  const SKIP_REASON_TEXT: Record<SkipReason, string> = {
    no_url: 'keine Abruf-URL auflösbar',
    no_gtin: 'keine EAN am Artikel',
    no_match: 'kein Preis/Treffer bei Globus',
    error: 'Fehler beim Abruf',
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Client-Spiegel der Server-Validierung (normalizeScrapeUrl): nur http/https.
  // Verhindert, dass ein abgelehnter Wert lokal „gültig" erscheint (Bug-Fix G4).
  function isValidHttpUrl(value: string): boolean {
    try {
      const u = new URL(value)
      return u.protocol === 'http:' || u.protocol === 'https:'
    } catch {
      return false
    }
  }

  // Client-Spiegel der {EAN}-Pflicht (G10-3): eine Abruf-URL ohne Platzhalter ist
  // nicht abrufbar und wird serverseitig abgelehnt — hier sofortiges Feedback.
  function hasEanPlaceholder(value: string): boolean {
    return value.includes('{EAN}')
  }

  // Adress-Vorschlag (OSM) übernehmen: Stadt + Koordinaten mitfüllen (Add-Form).
  function applyNewSuggestion(s: GeoSuggestion) {
    if (s.city) newCity = s.city
    newLat = s.lat
    newLon = s.lon
  }
  function applyEditSuggestion(s: GeoSuggestion) {
    if (s.city) editingCity = s.city
    editingLat = s.lat
    editingLon = s.lon
  }

  function startEdit(store: Store) {
    editingId = store.id
    editingName = store.name
    editingChain = store.chain ?? ''
    editingAddress = store.address ?? ''
    editingCity = store.city ?? ''
    editingLat = store.latitude
    editingLon = store.longitude
    editingScrapeUrl = store.scrapeUrl ?? ''
    editError = null
  }

  function cancelEdit() {
    editingId = null
    editError = null
  }

  async function saveEdit(id: string) {
    const name = editingName.trim()
    const chain = editingChain.trim() || null
    const address = editingAddress.trim()
    const city = editingCity.trim()
    const scrapeUrl = editingScrapeUrl.trim()

    if (!name) { editError = 'Name ist erforderlich.'; return }
    if (!address) { editError = 'Adresse ist erforderlich.'; return }
    if (!city) { editError = 'Stadt ist erforderlich.'; return }
    if (scrapeUrl && !isValidHttpUrl(scrapeUrl)) { editError = 'Ungültige Abruf-URL (nur http/https).'; return }
    if (scrapeUrl && !hasEanPlaceholder(scrapeUrl)) { editError = 'Abruf-URL muss den Platzhalter {EAN} enthalten.'; return }

    editSaving = true
    editError = null

    const formData = new FormData()
    formData.set('id', id)
    formData.set('name', name)
    if (chain) formData.set('chain', chain)
    formData.set('address', address)
    formData.set('city', city)
    if (editingLat) formData.set('latitude', editingLat)
    if (editingLon) formData.set('longitude', editingLon)
    formData.set('scrapeUrl', scrapeUrl)

    try {
      let res: Response
      let body: Record<string, unknown> = {}
      if (__STOQR_TARGET__ === 'app') {
        // App: kein Server -> per apiFetch->routeApp (PATCH /api/stores/:id).
        res = await apiFetch(`/api/stores/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            chain: chain || null,
            address,
            city,
            latitude: editingLat || null,
            longitude: editingLon || null,
            scrapeUrl,
          }),
        })
        body = await res.json().catch(() => ({}))
        if (!res.ok) {
          editError = String((body as { error?: string })?.error ?? `Fehler ${res.status}`)
          return
        }
        const updatedApp = body as unknown as Store
        storeRows = storeRows.map((s) => (s.id === id ? updatedApp : s))
        editingId = null
        return
      }
      res = await fetch('?/editStore', {
        method: 'POST',
        body: formData,
        headers: { 'x-sveltekit-action': 'true' },
      })
      body = await res.json().catch(() => ({}))

      if (!res.ok || (body as { status?: string })?.status === 'error') {
        const msg =
          (body as { data?: { error?: string } })?.data?.error ??
          (body as { error?: string })?.error ??
          `Fehler ${res.status}`
        editError = String(msg)
        return
      }

      const updated: Store | undefined = (body as { data?: { store?: Store } })?.data?.store
      if (updated) {
        // Server ist die Wahrheit (normalisierte/abgelehnte Werte) — lokal übernehmen.
        storeRows = storeRows.map((s) => (s.id === id ? updated : s))
      } else {
        storeRows = storeRows.map((s) =>
          s.id === id
            ? { ...s, name, chain, address: address || null, city: city || null, latitude: editingLat, longitude: editingLon, scrapeUrl: scrapeUrl || null }
            : s
        )
      }
      editingId = null
    } catch {
      editError = 'Netzwerkfehler.'
    } finally {
      editSaving = false
    }
  }

  async function deleteStore(id: string) {
    if (!window.confirm('Markt wirklich löschen?')) return

    deleting = id
    const formData = new FormData()
    formData.set('id', id)

    try {
      if (__STOQR_TARGET__ === 'app') {
        // App: DELETE /api/stores/:id via routeApp. 409 = noch referenziert.
        const res = await apiFetch(`/api/stores/${id}`, { method: 'DELETE' })
        if (res.status === 409) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error(String(body?.error ?? 'Dieser Markt kann nicht gelöscht werden, da er noch Artikeln zugeordnet ist.'))
          return
        }
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          toast.error(String(body?.error ?? `Fehler ${res.status}`))
          return
        }
        storeRows = storeRows.filter((s) => s.id !== id)
        return
      }
      const res = await fetch('?/deleteStore', {
        method: 'POST',
        body: formData,
        headers: { 'x-sveltekit-action': 'true' },
      })
      const body = await res.json().catch(() => ({}))

      if (res.status === 409 || (body?.data?.action === 'deleteStore' && body?.data?.error)) {
        const msg =
          body?.data?.error ??
          'Dieser Markt kann nicht gelöscht werden, da er noch Artikeln zugeordnet ist.'
        toast.error(String(msg))
        return
      }

      if (!res.ok) {
        const msg = body?.data?.error ?? body?.error ?? `Fehler ${res.status}`
        toast.error(String(msg))
        return
      }

      storeRows = storeRows.filter((s) => s.id !== id)
    } catch {
      toast.error('Netzwerkfehler beim Löschen.')
    } finally {
      deleting = null
    }
  }

  async function addStore() {
    const name = newName.trim()
    const chain = newChain.trim() || null
    const address = newAddress.trim()
    const city = newCity.trim()
    const scrapeUrl = newScrapeUrl.trim() || null

    if (!name) { addError = 'Name ist erforderlich.'; return }
    if (!address) { addError = 'Adresse ist erforderlich.'; return }
    if (!city) { addError = 'Stadt ist erforderlich.'; return }
    if (scrapeUrl && !isValidHttpUrl(scrapeUrl)) { addError = 'Ungültige Abruf-URL (nur http/https).'; return }
    if (scrapeUrl && !hasEanPlaceholder(scrapeUrl)) { addError = 'Abruf-URL muss den Platzhalter {EAN} enthalten.'; return }

    adding = true
    addError = null

    try {
      const res = await apiFetch('/api/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, chain, address, city, latitude: newLat, longitude: newLon, scrapeUrl }),
      })
      const created: Store | { error?: string } = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msg = (created as { error?: string }).error ?? `Fehler ${res.status}`
        addError = String(msg)
        return
      }

      storeRows = [...storeRows, created as Store].sort((a, b) => a.name.localeCompare(b.name))
      newName = ''
      newChain = ''
      newAddress = ''
      newCity = ''
      newLat = null
      newLon = null
      newScrapeUrl = ''
      toast.success('Markt hinzugefügt')
    } catch {
      addError = 'Netzwerkfehler.'
    } finally {
      adding = false
    }
  }

  async function fetchAllPrices(store: Store) {
    fetchingAll = store.id
    try {
      const res = await apiFetch(`/api/stores/${store.id}/prices/fetch-all`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(String(body?.error ?? `Fehler ${res.status}`))
        return
      }
      const { proposedCreated = 0, skipped = 0, failed = 0, skippedItems = [], failedItems = [] } = body as {
        proposedCreated?: number
        skipped?: number
        failed?: number
        skippedItems?: SkipItem[]
        failedItems?: SkipItem[]
      }
      fetchResults[store.id] = { skippedItems, failedItems }
      const parts = [`${proposedCreated} Vorschläge`]
      if (skipped) parts.push(`${skipped} übersprungen`)
      if (failed) parts.push(`${failed} fehlgeschlagen`)
      toast.success(parts.join(', '))
    } catch {
      toast.error('Netzwerkfehler beim Abruf.')
    } finally {
      fetchingAll = null
    }
  }
</script>

<div class="page">
  <!-- ── Breadcrumb ─────────────────────────────────────────────────────────── -->

  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einstellungen" class="breadcrumb-back">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einstellungen
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current" aria-current="page">Märkte</span>
  </nav>

  <!-- ── Header ─────────────────────────────────────────────────────────────── -->

  <header class="page-header">
    <h1 class="page-title">Märkte</h1>
    <p class="page-desc">
      Verwalte deine Einkaufsmärkte. Diese können Artikeln als Bezugsquellen zugeordnet werden.
    </p>
  </header>

  <!-- ── Load error banner ─────────────────────────────────────────────────── -->

  {#if pageLoadError}
    <div class="alert alert--error" role="alert" style="margin-bottom: var(--space-6);">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
        <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      </svg>
      {pageLoadError}
    </div>
  {/if}

  <!-- ── Store list ──────────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M2 7.5L9 2l7 5.5V16H12v-4H6v4H2V7.5Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
          </svg>
        </span>
        Meine Märkte
      </h2>
    </div>

    {#if storeRows.length === 0}
      <div class="empty-hint">Noch keine Märkte angelegt.</div>
    {:else}
      <div class="store-list" role="list">
        {#each storeRows as store (store.id)}
          <div class="store-row" role="listitem">
            {#if editingId === store.id}
              <!-- Inline edit -->
              <div class="store-edit-form">
                <div class="edit-fields">
                  <input
                    class="input"
                    type="text"
                    bind:value={editingName}
                    placeholder="Marktname"
                    maxlength="128"
                    aria-label="Marktname"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveEdit(store.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <input
                    class="input input--chain"
                    type="text"
                    bind:value={editingChain}
                    placeholder="Kette (optional)"
                    maxlength="64"
                    aria-label="Kette"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveEdit(store.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                </div>
                <div class="edit-fields edit-fields--address">
                  <AddressAutocomplete
                    bind:value={editingAddress}
                    placeholder="Adresse suchen (Pflicht)"
                    ariaLabel="Adresse"
                    onselect={applyEditSuggestion}
                  />
                  <input
                    class="input input--city"
                    type="text"
                    bind:value={editingCity}
                    placeholder="Ort/Stadt (Pflicht)"
                    maxlength="128"
                    aria-label="Ort/Stadt"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveEdit(store.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                </div>
                <div class="edit-fields edit-fields--url">
                  <input
                    class="input input--url"
                    type="text"
                    inputmode="url"
                    bind:value={editingScrapeUrl}
                    placeholder="Abruf-URL für Online-Preise (optional)"
                    maxlength="1024"
                    aria-label="Abruf-URL"
                    onkeydown={(e) => {
                      if (e.key === 'Enter') saveEdit(store.id)
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <p class="field-hint">Produkt-Such-URL des Markts mit <code>{'{EAN}'}</code> als Platzhalter für die Artikel-EAN. Für Globus die <strong>Suggest</strong>-URL nutzen: <code>https://produkte.globus.de/hockenheim/suggest?search={'{EAN}'}</code> (Filiale ggf. anpassen).</p>
                </div>
                {#if editError}
                  <p class="field-error">{editError}</p>
                {/if}
                <div class="edit-actions">
                  <button
                    class="btn-save-inline"
                    type="button"
                    disabled={editSaving}
                    aria-label="Speichern"
                    onclick={() => saveEdit(store.id)}
                  >
                    {#if editSaving}
                      <span class="spinner spinner--sm" aria-hidden="true"></span>
                    {:else}
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                      </svg>
                    {/if}
                    Speichern
                  </button>
                  <button
                    class="btn-cancel-inline"
                    type="button"
                    onclick={cancelEdit}
                    aria-label="Abbrechen"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            {:else}
              <!-- Display row -->
              <div class="store-info">
                <div class="store-info-main">
                  <span class="store-name">{store.name}</span>
                  {#if store.chain}
                    <span class="chain-badge">{store.chain}</span>
                  {/if}
                </div>
                {#if store.address || store.city}
                  <span class="store-address">
                    {[store.address, store.city].filter(Boolean).join(', ')}
                  </span>
                {/if}
                {#if store.scrapeUrl}
                  <span class="scrape-badge" title={store.scrapeUrl}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M4.5 7.5l3-3M5 3.5l.7-.7a2 2 0 012.8 2.8l-.7.7M7 8.5l-.7.7a2 2 0 01-2.8-2.8l.7-.7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                    </svg>
                    Online-Abruf aktiv
                  </span>
                {/if}
              </div>
              <div class="store-actions">
                {#if priceScrapeEnabled && store.scrapeUrl}
                  <button
                    class="btn-edit-inline"
                    type="button"
                    disabled={fetchingAll === store.id}
                    onclick={() => fetchAllPrices(store)}
                    aria-label="Preise für {store.name} abrufen"
                  >
                    {#if fetchingAll === store.id}
                      <span class="spinner spinner--sm" aria-hidden="true"></span>
                    {/if}
                    Preise abrufen
                  </button>
                {/if}
                <button
                  class="btn-edit-inline"
                  type="button"
                  onclick={() => startEdit(store)}
                  aria-label="{store.name} bearbeiten"
                >
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                  Bearbeiten
                </button>
                <button
                  class="btn-delete-inline"
                  type="button"
                  disabled={deleting === store.id}
                  onclick={() => deleteStore(store.id)}
                  aria-label="{store.name} löschen"
                >
                  {#if deleting === store.id}
                    <span class="spinner spinner--sm spinner--danger" aria-hidden="true"></span>
                  {:else}
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                      <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  {/if}
                  Löschen
                </button>
              </div>
            {/if}
            {#if fetchResults[store.id] && (fetchResults[store.id].skippedItems.length > 0 || fetchResults[store.id].failedItems.length > 0)}
              <details class="fetch-report">
                <summary>
                  {fetchResults[store.id].skippedItems.length + fetchResults[store.id].failedItems.length} Artikel nicht abgerufen — anzeigen
                </summary>
                <ul class="fetch-report-list">
                  {#each [...fetchResults[store.id].skippedItems, ...fetchResults[store.id].failedItems] as it (it.id)}
                    <li>
                      <span class="fetch-report-name">{it.name}</span>
                      {#if it.gtin}<span class="fetch-report-gtin">EAN {it.gtin}</span>{/if}
                      <span class="fetch-report-reason">{SKIP_REASON_TEXT[it.reason]}</span>
                    </li>
                  {/each}
                </ul>
              </details>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Add new store ─────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M9 5.5v7M5.5 9h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        Neuen Markt hinzufügen
      </h2>
    </div>

    {#if addError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {addError}
      </div>
    {/if}

    <div class="add-form">
      <div class="add-fields">
        <input
          class="input"
          type="text"
          bind:value={newName}
          placeholder="Name des Markts"
          maxlength="128"
          aria-label="Name des neuen Markts"
          onkeydown={(e) => { if (e.key === 'Enter') addStore() }}
        />
        <input
          class="input input--chain"
          type="text"
          bind:value={newChain}
          placeholder="Kette (optional) — z.B. Penny, Edeka, Globus, Lidl, Rewe"
          maxlength="64"
          aria-label="Kette des neuen Markts"
          onkeydown={(e) => { if (e.key === 'Enter') addStore() }}
        />
      </div>
      <div class="add-fields add-fields--address">
        <AddressAutocomplete
          bind:value={newAddress}
          placeholder="Adresse suchen (Pflicht)"
          ariaLabel="Adresse des neuen Markts"
          onselect={applyNewSuggestion}
        />
        <input
          class="input input--city"
          type="text"
          bind:value={newCity}
          placeholder="Ort/Stadt (Pflicht)"
          maxlength="128"
          aria-label="Ort/Stadt des neuen Markts"
          onkeydown={(e) => { if (e.key === 'Enter') addStore() }}
        />
      </div>
      <div class="add-fields add-fields--url">
        <input
          class="input input--url"
          type="text"
          inputmode="url"
          bind:value={newScrapeUrl}
          placeholder="Abruf-URL für Online-Preise (optional)"
          maxlength="1024"
          aria-label="Abruf-URL des neuen Markts"
          onkeydown={(e) => { if (e.key === 'Enter') addStore() }}
        />
        <p class="field-hint">Produkt-Such-URL des Markts mit <code>{'{EAN}'}</code> als Platzhalter für die Artikel-EAN. Für Globus die <strong>Suggest</strong>-URL nutzen: <code>https://produkte.globus.de/hockenheim/suggest?search={'{EAN}'}</code> (Filiale ggf. anpassen).</p>
      </div>
      <div class="add-footer">
        <button
          class="btn-primary"
          type="button"
          disabled={adding}
          onclick={addStore}
        >
          {#if adding}
            <span class="spinner" aria-hidden="true"></span>
            Hinzufügen…
          {:else}
            Hinzufügen
          {/if}
        </button>
      </div>
    </div>
  </section>
</div>

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

  /* ── Breadcrumb ───────────────────────────────────────────────────────── */

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .breadcrumb-back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    transition: color var(--transition-fast);
  }

  .breadcrumb-back:hover {
    color: var(--color-primary-hover);
  }

  .breadcrumb-sep {
    color: var(--color-text-muted);
    user-select: none;
  }

  .breadcrumb-current {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

  /* ── Page header ──────────────────────────────────────────────────────── */

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-2);
  }

  .page-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Section ──────────────────────────────────────────────────────────── */

  .settings-section {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  .section-header {
    margin-bottom: var(--space-5);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .section-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  /* ── Empty hint ───────────────────────────────────────────────────────── */

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-2) 0 var(--space-1);
  }

  /* ── Store list ───────────────────────────────────────────────────────── */

  .store-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .store-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface);
    transition: background-color var(--transition-fast);
    min-height: 52px;
  }

  .store-row:last-child {
    border-bottom: none;
  }

  .store-row:hover {
    background-color: var(--color-surface-sunken);
  }

  .fetch-report {
    flex-basis: 100%;
    margin-top: var(--space-2);
    font-size: var(--text-sm);
  }
  .fetch-report > summary {
    cursor: pointer;
    color: var(--color-warning, #c2410c);
    font-weight: 600;
  }
  .fetch-report-list {
    margin: var(--space-2) 0 0;
    padding-left: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .fetch-report-list li {
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
    flex-wrap: wrap;
    font-size: var(--text-xs);
  }
  .fetch-report-name { font-weight: 600; color: var(--color-text-primary); }
  .fetch-report-gtin { color: var(--color-text-muted); }
  .fetch-report-reason { color: var(--color-warning, #c2410c); }

  .store-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .store-info-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .store-address {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .store-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chain-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .store-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  /* ── Inline edit form ─────────────────────────────────────────────────── */

  .store-edit-form {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .edit-fields {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .edit-actions {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .field-error {
    font-size: var(--text-xs);
    color: var(--color-danger, #dc2626);
    margin: 0;
  }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
    line-height: 1.5;
    width: 100%;
  }
  .field-hint code {
    font-size: 0.9em;
    background: var(--color-surface-sunken);
    padding: 0 4px;
    border-radius: var(--radius-sm);
    word-break: break-all;
  }
  .edit-fields--url,
  .add-fields--url {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  /* ── Add form ─────────────────────────────────────────────────────────── */

  .add-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .add-fields {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .add-footer {
    display: flex;
    justify-content: flex-start;
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */

  .input {
    flex: 1 1 160px;
    min-width: 140px;
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
    box-sizing: border-box;
    appearance: none;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--chain {
    flex: 1 1 200px;
  }

  .input--city {
    flex: 1 1 140px;
  }

  .input--url {
    flex: 1 1 100%;
  }

  .scrape-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-primary);
  }

  .edit-fields--address,
  .add-fields--address {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  /* ── Alerts ───────────────────────────────────────────────────────────── */

  .alert {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-4);
  }

  .alert--error {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-5);
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
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-edit-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-edit-inline:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .btn-delete-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-delete-inline:hover:not(:disabled) {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  .btn-delete-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-save-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
  }

  .btn-save-inline:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-save-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel-inline {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-cancel-inline:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

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

  .spinner--sm {
    width: 11px;
    height: 11px;
  }

  .spinner--danger {
    border-color: rgba(220, 38, 38, 0.3);
    border-top-color: var(--color-danger, #dc2626);
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ───────────────────────────────────────────────────────── */

  @media (max-width: 560px) {
    .page {
      padding: var(--space-5) var(--space-3) var(--space-12);
    }

    .settings-section {
      padding: var(--space-4);
    }

    .edit-fields .input,
    .add-fields .input {
      flex-basis: 100%;
      min-width: 0;
    }

    .store-row {
      flex-direction: column;
      align-items: flex-start;
    }

    .store-actions {
      width: 100%;
      justify-content: flex-end;
    }

    .add-footer .btn-primary {
      width: 100%;
      justify-content: center;
    }
  }
</style>
