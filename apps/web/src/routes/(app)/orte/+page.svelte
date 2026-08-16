<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { toast } from '$lib/stores/toast'
  import EmojiPicker from '$lib/components/EmojiPicker.svelte'

  // ── Types ─────────────────────────────────────────────────────────────────

  type Place = {
    id: string
    name: string
    icon: string | null
    sortOrder: number
  }

  type Storage = {
    id: string
    name: string
    icon: string | null
    storageType: 'fridge' | 'freezer' | 'shelf' | 'cabinet' | 'other' | null
    sortOrder: number
    places: Place[]
  }

  type Location = {
    id: string
    name: string
    icon: string | null
    sortOrder: number
    storages: Storage[]
  }

  // ── Props ─────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── State ─────────────────────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let locations = $state<Location[]>(data.locations as Location[])

  // Accordion open/close state
  let openLocations = $state<Set<string>>(new Set())
  let openStorages = $state<Set<string>>(new Set())

  // Inline edit state
  type EditTarget =
    | { kind: 'location'; id: string; name: string; icon: string }
    | { kind: 'storage'; id: string; name: string; icon: string }
    | { kind: 'place'; id: string; name: string; icon: string }

  let editing = $state<EditTarget | null>(null)

  // Add-form state
  type AddTarget =
    | { kind: 'location' }
    | { kind: 'storage'; locationId: string }
    | { kind: 'place'; storageId: string }

  let adding = $state<AddTarget | null>(null)
  let addName = $state('')
  let addIcon = $state('')

  // Shared emoji picker — one instance, driven by scope
  let emojiPickerFor = $state<{ scope: 'add' | 'edit' } | null>(null)

  function pickEmoji(emoji: string) {
    if (emojiPickerFor?.scope === 'add') {
      addIcon = emoji
    } else if (editing !== null) {
      editing = { ...editing, icon: emoji }
    }
  }


  function toggleLocation(id: string) {
    const next = new Set(openLocations)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    openLocations = next
  }

  function toggleStorage(id: string) {
    const next = new Set(openStorages)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    openStorages = next
  }

  // ── Storage type label ────────────────────────────────────────────────────

  const storageTypeLabels: Record<string, string> = {
    fridge: 'Kühlschrank',
    freezer: 'Tiefkühler',
    shelf: 'Regal',
    cabinet: 'Schrank',
    other: 'Sonstiges',
  }

  function storageTypeLabel(type: string | null): string {
    return type ? (storageTypeLabels[type] ?? type) : ''
  }

  // ── Icon helpers ──────────────────────────────────────────────────────────

  function locationIcon(icon: string | null): string {
    return icon ?? '📍'
  }

  function storageIcon(icon: string | null, type: string | null): string {
    if (icon) return icon
    const icons: Record<string, string> = {
      fridge: '🧊',
      freezer: '❄️',
      shelf: '📦',
      cabinet: '🗄️',
      other: '📁',
    }
    return type ? (icons[type] ?? '📦') : '📦'
  }

  // ── Item count helper ─────────────────────────────────────────────────────

  function countItems(location: Location): number {
    return location.storages.reduce((acc, s) => acc + s.places.length, 0)
  }

  // ── ADD mutations ─────────────────────────────────────────────────────────

  async function submitAdd() {
    const name = addName.trim()
    if (!name || !adding) return

    try {
      if (adding.kind === 'location') {
        const res = await apiFetch('/api/locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon: addIcon.trim() || null }),
        })
        if (!res.ok) throw new Error(await res.text())
        const created: Location = await res.json()
        locations = [...locations, { ...created, storages: [] }]
        openLocations = new Set([...openLocations, created.id])
        toast.success(`Raum "${name}" hinzugefügt`)
      } else if (adding.kind === 'storage') {
        const res = await apiFetch('/api/storages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locationId: adding.locationId, name, icon: addIcon.trim() || null }),
        })
        if (!res.ok) throw new Error(await res.text())
        const created: Storage = await res.json()
        locations = locations.map((loc) =>
          loc.id === adding!.locationId
            ? { ...loc, storages: [...loc.storages, { ...created, places: [] }] }
            : loc
        )
        openStorages = new Set([...openStorages, created.id])
        toast.success(`Lagerort "${name}" hinzugefügt`)
      } else if (adding.kind === 'place') {
        const res = await apiFetch('/api/places', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageId: adding.storageId, name, icon: addIcon.trim() || null }),
        })
        if (!res.ok) throw new Error(await res.text())
        const created: Place = await res.json()
        locations = locations.map((loc) => ({
          ...loc,
          storages: loc.storages.map((s) =>
            s.id === adding!.storageId
              ? { ...s, places: [...s.places, created] }
              : s
          ),
        }))
        toast.success(`Fach "${name}" hinzugefügt`)
      }
    } catch {
      toast.error('Fehler beim Hinzufügen')
    } finally {
      adding = null
      addName = ''
      addIcon = ''
      emojiPickerFor = null
    }
  }

  function cancelAdd() {
    adding = null
    addName = ''
    addIcon = ''
    emojiPickerFor = null
  }

  // ── EDIT mutations ────────────────────────────────────────────────────────

  function startEdit(target: EditTarget) {
    editing = { ...target }
    emojiPickerFor = null
  }

  async function submitEdit() {
    if (!editing) return
    const name = editing.name.trim()
    if (!name) return

    try {
      if (editing.kind === 'location') {
        const icon = editing.icon.trim() || null
        const res = await apiFetch(`/api/locations/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon }),
        })
        if (!res.ok) throw new Error(await res.text())
        locations = locations.map((loc) =>
          loc.id === editing!.id ? { ...loc, name, icon } : loc
        )
        toast.success('Raum umbenannt')
      } else if (editing.kind === 'storage') {
        const icon = editing.icon.trim() || null
        const res = await apiFetch(`/api/storages/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon }),
        })
        if (!res.ok) throw new Error(await res.text())
        locations = locations.map((loc) => ({
          ...loc,
          storages: loc.storages.map((s) =>
            s.id === editing!.id ? { ...s, name, icon } : s
          ),
        }))
        toast.success('Lagerort umbenannt')
      } else if (editing.kind === 'place') {
        const icon = editing.icon.trim() || null
        const res = await apiFetch(`/api/places/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, icon }),
        })
        if (!res.ok) throw new Error(await res.text())
        locations = locations.map((loc) => ({
          ...loc,
          storages: loc.storages.map((s) => ({
            ...s,
            places: s.places.map((p) =>
              p.id === editing!.id ? { ...p, name, icon } : p
            ),
          })),
        }))
        toast.success('Fach umbenannt')
      }
    } catch {
      toast.error('Fehler beim Speichern')
    } finally {
      editing = null
      emojiPickerFor = null
    }
  }

  function cancelEdit() {
    editing = null
    emojiPickerFor = null
  }

  // ── DELETE mutations ──────────────────────────────────────────────────────

  async function deleteLocation(loc: Location) {
    if (!window.confirm(`Raum "${loc.name}" wirklich löschen? Alle darin enthaltenen Lagerorte und Fächer werden ebenfalls gelöscht.`)) return
    try {
      const res = await apiFetch(`/api/locations/${loc.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      locations = locations.filter((l) => l.id !== loc.id)
      toast.success(`Raum "${loc.name}" gelöscht`)
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  async function deleteStorage(storage: Storage) {
    if (!window.confirm(`Lagerort "${storage.name}" wirklich löschen? Alle darin enthaltenen Fächer werden ebenfalls gelöscht.`)) return
    try {
      const res = await apiFetch(`/api/storages/${storage.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      locations = locations.map((loc) => ({
        ...loc,
        storages: loc.storages.filter((s) => s.id !== storage.id),
      }))
      toast.success(`Lagerort "${storage.name}" gelöscht`)
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  async function deletePlace(place: Place) {
    if (!window.confirm(`Fach "${place.name}" wirklich löschen?`)) return
    try {
      const res = await apiFetch(`/api/places/${place.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      locations = locations.map((loc) => ({
        ...loc,
        storages: loc.storages.map((s) => ({
          ...s,
          places: s.places.filter((p) => p.id !== place.id),
        })),
      }))
      toast.success(`Fach "${place.name}" gelöscht`)
    } catch {
      toast.error('Fehler beim Löschen')
    }
  }

  // ── Keyboard helpers ──────────────────────────────────────────────────────

  function onEditKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitEdit()
    if (e.key === 'Escape') cancelEdit()
  }

  function onAddKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') submitAdd()
    if (e.key === 'Escape') cancelAdd()
  }
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">
  <!-- Header -->
  <div class="page-header">
    <h1 class="page-title">Räume</h1>
    <button
      class="btn-primary"
      type="button"
      onclick={() => { adding = { kind: 'location' }; addName = ''; addIcon = ''; emojiPickerFor = null }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Raum hinzufügen
    </button>
  </div>

  <!-- Add location inline form -->
  {#if adding?.kind === 'location'}
    <div class="add-form add-form--top">
      <div class="field field--emoji">
        <span class="field-label">Icon</span>
        <button
          class="icon-btn"
          type="button"
          onclick={() => (emojiPickerFor = { scope: 'add' })}
          aria-label="Icon wählen"
          title="Icon wählen"
        >{addIcon || '📍'}</button>
      </div>
      <div class="field field--grow">
        <span class="field-label">Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="input"
          type="text"
          placeholder="Name des Raums"
          autofocus
          bind:value={addName}
          onkeydown={onAddKeydown}
        />
      </div>
      <div class="field field--actions">
        <button class="btn-save" type="button" onclick={submitAdd}>Hinzufügen</button>
        <button class="btn-cancel" type="button" onclick={cancelAdd}>Abbrechen</button>
      </div>
    </div>
  {/if}

  <!-- Empty state -->
  {#if locations.length === 0 && adding?.kind !== 'location'}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="72" height="72" rx="16" fill="var(--color-primary-subtle)"/>
          <path d="M36 18C28.268 18 22 24.268 22 32C22 42 36 54 36 54C36 54 50 42 50 32C50 24.268 43.732 18 36 18Z" stroke="var(--color-primary)" stroke-width="2.5" stroke-linejoin="round" fill="none"/>
          <circle cx="36" cy="32" r="5" stroke="var(--color-primary)" stroke-width="2.5" fill="none"/>
        </svg>
      </div>
      <p class="empty-title">Noch keine Räume angelegt</p>
      <p class="empty-sub">Erstelle deinen ersten Ort, um dein Inventar zu organisieren.</p>
      <button
        class="btn-primary btn-primary--lg"
        type="button"
        onclick={() => { adding = { kind: 'location' }; addName = ''; addIcon = ''; emojiPickerFor = null }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Ersten Raum anlegen
      </button>
    </div>

  {:else}
    <!-- Location list -->
    <ul class="location-list" role="list">
      {#each locations as loc (loc.id)}
        <li class="location-card">
          <!-- Location header -->
          <div class="location-header">
            <button
              class="accordion-toggle"
              type="button"
              aria-expanded={openLocations.has(loc.id)}
              onclick={() => toggleLocation(loc.id)}
            >
              <span class="entity-icon">{locationIcon(loc.icon)}</span>
              {#if editing?.kind === 'location' && editing.id === loc.id}
                <!-- inline edit -->
              {:else}
                <span class="entity-name">{loc.name}</span>
              {/if}
              <span class="badge">{countItems(loc)}</span>
              <svg
                class="chevron"
                class:open={openLocations.has(loc.id)}
                width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            {#if editing?.kind === 'location' && editing.id === loc.id}
              <div class="inline-edit">
                <button
                  class="icon-btn"
                  type="button"
                  onclick={() => (emojiPickerFor = { scope: 'edit' })}
                  aria-label="Icon wählen"
                  title="Icon wählen"
                >{editing?.icon || '📍'}</button>
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  class="input input--sm"
                  type="text"
                  autofocus
                  bind:value={editing.name}
                  onkeydown={onEditKeydown}
                />
                <button class="btn-save" type="button" onclick={submitEdit}>Speichern</button>
                <button class="btn-cancel" type="button" onclick={cancelEdit}>Abbrechen</button>
              </div>
            {:else}
              <div class="entity-actions">
                <button
                  class="btn-icon"
                  type="button"
                  title="Bearbeiten"
                  onclick={() => startEdit({ kind: 'location', id: loc.id, name: loc.name, icon: loc.icon ?? '' })}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                  </svg>
                </button>
                <button
                  class="btn-icon btn-icon--danger"
                  type="button"
                  title="Löschen"
                  onclick={() => deleteLocation(loc)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 3.5V11h4V3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                </button>
              </div>
            {/if}
          </div>

          <!-- Location body (storages) -->
          {#if openLocations.has(loc.id)}
            <div class="location-body">
              {#if loc.storages.length === 0 && !(adding?.kind === 'storage' && adding.locationId === loc.id)}
                <p class="sub-empty">Noch keine Lagerorte. Füge einen hinzu.</p>
              {/if}

              <ul class="storage-list" role="list">
                {#each loc.storages as st (st.id)}
                  <li class="storage-card">
                    <!-- Storage header -->
                    <div class="storage-header">
                      <button
                        class="accordion-toggle accordion-toggle--sm"
                        type="button"
                        aria-expanded={openStorages.has(st.id)}
                        onclick={() => toggleStorage(st.id)}
                      >
                        <span class="entity-icon entity-icon--sm">{storageIcon(st.icon, st.storageType)}</span>
                        {#if !(editing?.kind === 'storage' && editing.id === st.id)}
                          <span class="entity-name entity-name--sm">{st.name}</span>
                        {/if}
                        {#if st.storageType}
                          <span class="type-badge">{storageTypeLabel(st.storageType)}</span>
                        {/if}
                        <svg
                          class="chevron chevron--sm"
                          class:open={openStorages.has(st.id)}
                          width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                        >
                          <path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>

                      {#if editing?.kind === 'storage' && editing.id === st.id}
                        <div class="inline-edit">
                          <button
                            class="icon-btn"
                            type="button"
                            onclick={() => (emojiPickerFor = { scope: 'edit' })}
                            aria-label="Icon wählen"
                            title="Icon wählen"
                          >{editing?.icon || '📦'}</button>
                          <!-- svelte-ignore a11y_autofocus -->
                          <input
                            class="input input--sm"
                            type="text"
                            autofocus
                            bind:value={editing.name}
                            onkeydown={onEditKeydown}
                          />
                          <button class="btn-save" type="button" onclick={submitEdit}>Speichern</button>
                          <button class="btn-cancel" type="button" onclick={cancelEdit}>Abbrechen</button>
                        </div>
                      {:else}
                        <div class="entity-actions">
                          <button
                            class="btn-icon"
                            type="button"
                            title="Bearbeiten"
                            onclick={() => startEdit({ kind: 'storage', id: st.id, name: st.name, icon: st.icon ?? '' })}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                            </svg>
                          </button>
                          <button
                            class="btn-icon btn-icon--danger"
                            type="button"
                            title="Löschen"
                            onclick={() => deleteStorage(st)}
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 3.5V11h4V3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      {/if}
                    </div>

                    <!-- Storage body (places) -->
                    {#if openStorages.has(st.id)}
                      <div class="storage-body">
                        {#if st.places.length > 0}
                          <div class="places-grid">
                            {#each st.places as pl (pl.id)}
                              <div class="place-chip">
                                {#if editing?.kind === 'place' && editing.id === pl.id}
                                  <div class="inline-edit inline-edit--chip">
                                    <button
                                      class="icon-btn"
                                      type="button"
                                      onclick={() => (emojiPickerFor = { scope: 'edit' })}
                                      aria-label="Icon wählen"
                                      title="Icon wählen"
                                    >{editing?.icon || '📦'}</button>
                                    <!-- svelte-ignore a11y_autofocus -->
                                    <input
                                      class="input input--xs"
                                      type="text"
                                      autofocus
                                      bind:value={editing.name}
                                      onkeydown={onEditKeydown}
                                    />
                                    <button class="btn-save btn-save--xs" type="button" onclick={submitEdit} title="Speichern">
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                        <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                                      </svg>
                                    </button>
                                    <button class="btn-cancel btn-cancel--xs" type="button" onclick={cancelEdit} title="Abbrechen">
                                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                                        <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                                      </svg>
                                    </button>
                                  </div>
                                {:else}
                                  <span class="place-icon">{pl.icon ?? '📦'}</span>
                                  <span class="place-name">{pl.name}</span>
                                  <button
                                    class="chip-btn"
                                    type="button"
                                    title="Bearbeiten"
                                    onclick={() => startEdit({ kind: 'place', id: pl.id, name: pl.name, icon: pl.icon ?? '' })}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                      <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                                    </svg>
                                  </button>
                                  <button
                                    class="chip-btn chip-btn--danger"
                                    type="button"
                                    title="Löschen"
                                    onclick={() => deletePlace(pl)}
                                  >
                                    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                                      <path d="M2 3.5h10M5.5 3.5V2.5h3V3.5M5 3.5V11h4V3.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                  </button>
                                {/if}
                              </div>
                            {/each}
                          </div>
                        {/if}

                        <!-- Add place form -->
                        {#if adding?.kind === 'place' && adding.storageId === st.id}
                          <div class="add-form add-form--inline">
                            <button
                              class="icon-btn"
                              type="button"
                              onclick={() => (emojiPickerFor = { scope: 'add' })}
                              aria-label="Icon wählen"
                              title="Icon wählen"
                            >{addIcon || '📦'}</button>
                            <!-- svelte-ignore a11y_autofocus -->
                            <input
                              class="input input--sm"
                              type="text"
                              placeholder="Name des Fachs"
                              autofocus
                              bind:value={addName}
                              onkeydown={onAddKeydown}
                            />
                            <button class="btn-save" type="button" onclick={submitAdd}>Hinzufügen</button>
                            <button class="btn-cancel" type="button" onclick={cancelAdd}>Abbrechen</button>
                          </div>
                        {:else}
                          <button
                            class="btn-add-child"
                            type="button"
                            onclick={() => { adding = { kind: 'place', storageId: st.id }; addName = ''; addIcon = ''; emojiPickerFor = null }}
                          >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                            </svg>
                            Fach hinzufügen
                          </button>
                        {/if}
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>

              <!-- Add storage form -->
              {#if adding?.kind === 'storage' && adding.locationId === loc.id}
                <div class="add-form add-form--inline add-form--storage">
                  <div class="field field--emoji">
                    <span class="field-label">Icon</span>
                    <button
                      class="icon-btn"
                      type="button"
                      onclick={() => (emojiPickerFor = { scope: 'add' })}
                      aria-label="Icon wählen"
                      title="Icon wählen"
                    >{addIcon || '📦'}</button>
                  </div>
                  <div class="field field--grow">
                    <span class="field-label">Name</span>
                    <!-- svelte-ignore a11y_autofocus -->
                    <input
                      class="input input--sm"
                      type="text"
                      placeholder="Name des Lagerorts"
                      autofocus
                      bind:value={addName}
                      onkeydown={onAddKeydown}
                    />
                  </div>
                  <div class="field field--actions">
                    <button class="btn-save" type="button" onclick={submitAdd}>Hinzufügen</button>
                    <button class="btn-cancel" type="button" onclick={cancelAdd}>Abbrechen</button>
                  </div>
                </div>
              {:else}
                <button
                  class="btn-add-child"
                  type="button"
                  onclick={() => { adding = { kind: 'storage', locationId: loc.id }; addName = ''; addIcon = ''; emojiPickerFor = null }}
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                  Lagerort hinzufügen
                </button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<!-- Shared emoji picker -->
<EmojiPicker
  open={emojiPickerFor !== null}
  context="place"
  current={emojiPickerFor?.scope === 'add' ? (addIcon || null) : (editing?.icon || null)}
  onPick={pickEmoji}
  onClose={() => (emojiPickerFor = null)}
/>

<style>
  /* ── Page layout ──────────────────────────────────────────────────────── */

  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6);
  }

  .page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
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
    flex-shrink: 0;
  }

  .btn-primary:hover {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary--lg {
    height: 44px;
    padding: 0 var(--space-6);
    font-size: var(--text-base);
  }

  .btn-save {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-save:hover {
    background-color: var(--color-primary-hover);
  }

  .btn-cancel {
    display: inline-flex;
    align-items: center;
    height: 34px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-cancel:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  .btn-save--xs,
  .btn-cancel--xs {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border-radius: var(--radius-sm);
    border: none;
    cursor: pointer;
    transition: background-color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-save--xs {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
  }

  .btn-save--xs:hover {
    background-color: var(--color-primary-hover);
  }

  .btn-cancel--xs {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }

  .btn-cancel--xs:hover {
    background-color: var(--color-border);
  }

  .btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .btn-icon:hover {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .btn-icon--danger:hover {
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  .btn-add-child {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px dashed var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    margin-top: var(--space-3);
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }

  .btn-add-child:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  /* ── Input ────────────────────────────────────────────────────────────── */

  .input {
    height: 38px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    min-width: 0;
    width: 100%;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--sm {
    height: 34px;
    font-size: var(--text-sm);
  }

  .input--xs {
    height: 28px;
    font-size: var(--text-sm);
    padding: 0 var(--space-2);
  }

  /* ── Field layout ─────────────────────────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: 0;
  }

  .field--grow {
    flex: 1;
    min-width: 0;
  }

  .field--emoji {
    flex-shrink: 0;
    width: auto;
  }

  .field--actions {
    display: flex;
    flex-direction: row;
    align-items: flex-end;
    gap: var(--space-2);
  }

  .field-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  /* ── Icon button ──────────────────────────────────────────────────────── */

  .icon-btn {
    flex: 0 0 auto;
    width: 48px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    line-height: 1;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    cursor: pointer;
  }

  .icon-btn:hover {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }

  /* ── Add form ─────────────────────────────────────────────────────────── */

  .add-form {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .add-form--top {
    margin-bottom: var(--space-4);
  }

  .add-form--inline {
    margin-top: var(--space-3);
  }

  .add-form--storage {
    flex-wrap: wrap;
  }

  /* ── Inline edit ──────────────────────────────────────────────────────── */

  .inline-edit {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .inline-edit--chip {
    flex: none;
    align-items: center;
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

  /* ── Location list ────────────────────────────────────────────────────── */

  .location-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* ── Location card ────────────────────────────────────────────────────── */

  .location-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: visible;
    box-shadow: var(--shadow-sm);
    position: relative;
  }

  .location-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-3) var(--space-1) 0;
    min-height: 52px;
  }

  .location-body {
    padding: var(--space-3) var(--space-4) var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
    background-color: var(--color-surface);
  }

  /* ── Storage list ─────────────────────────────────────────────────────── */

  .storage-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .storage-card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    overflow: visible;
    position: relative;
  }

  .storage-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    min-height: 44px;
  }

  .storage-body {
    padding: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
    background-color: var(--color-base);
  }

  /* ── Accordion toggle ─────────────────────────────────────────────────── */

  .accordion-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    background-color: transparent;
    cursor: pointer;
    text-align: left;
    color: inherit;
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
  }

  .accordion-toggle:hover {
    background-color: var(--color-surface-sunken);
  }

  .accordion-toggle--sm {
    padding: var(--space-2);
  }

  /* ── Entity parts ─────────────────────────────────────────────────────── */

  .entity-icon {
    font-size: 1.2em;
    line-height: 1;
    flex-shrink: 0;
  }

  .entity-icon--sm {
    font-size: 1em;
  }

  .entity-name {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entity-name--sm {
    font-size: var(--text-sm);
    font-weight: 500;
    flex: 1;
  }

  .entity-actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
    padding-right: var(--space-2);
  }

  /* ── Badge ────────────────────────────────────────────────────────────── */

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
    font-size: var(--text-xs);
    font-weight: 600;
    flex-shrink: 0;
  }

  .type-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-secondary-subtle);
    color: var(--color-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    flex-shrink: 0;
  }

  /* ── Chevron ──────────────────────────────────────────────────────────── */

  .chevron {
    flex-shrink: 0;
    color: var(--color-text-muted);
    transition: transform var(--transition-base);
    margin-left: auto;
  }

  .chevron.open {
    transform: rotate(180deg);
  }

  .chevron--sm {
    width: 14px;
    height: 14px;
  }

  /* ── Sub empty ────────────────────────────────────────────────────────── */

  .sub-empty {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    font-style: italic;
    margin: 0 0 var(--space-2);
  }

  /* ── Places grid ──────────────────────────────────────────────────────── */

  .places-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }

  /* ── Place chip ───────────────────────────────────────────────────────── */

  .place-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-2) 0 var(--space-3);
    border-radius: var(--radius-full);
    background-color: var(--color-primary-subtle);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
  }

  .place-icon {
    font-size: var(--text-sm);
    line-height: 1;
    flex-shrink: 0;
  }

  .place-name {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .chip-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: none;
    background-color: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    padding: 0;
    transition: background-color var(--transition-fast), color var(--transition-fast);
    flex-shrink: 0;
  }

  .chip-btn:hover {
    background-color: var(--color-border);
    color: var(--color-text-primary);
  }

  .chip-btn--danger:hover {
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  /* ── Mobile ───────────────────────────────────────────────────────────── */

  @media (max-width: 600px) {
    .page {
      padding: var(--space-5) var(--space-4);
    }

    .page-title {
      font-size: var(--text-xl);
    }

    .entity-name {
      font-size: var(--text-sm);
    }

    .add-form {
      flex-wrap: wrap;
    }

    .add-form .input {
      min-width: 0;
      flex: 1 1 auto;
    }
  }
</style>
