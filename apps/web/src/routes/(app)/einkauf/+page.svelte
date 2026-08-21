<script lang="ts">
  import type { PageData } from './$types'
  import { apiFetch } from '$lib/client/api'
  import { goto, invalidateAll } from '$app/navigation'
  import { toast } from '$lib/stores/toast'

  let { data }: { data: PageData } = $props()

  type StoreOpt = { id: string; name: string; chain: string | null }
  type Trip = {
    id: string
    name: string | null
    storeId: string | null
    status: 'begonnen' | 'pausiert' | 'beendet'
    startedAt: string
    endedAt: string | null
    store: { id: string; name: string; chain: string | null } | null
    itemCount: number
  }

  const trips = $derived((data.trips as Trip[]) ?? [])
  const stores = $derived((data.stores as StoreOpt[]) ?? [])
  const loadError = $derived(data.loadError as string | null)

  const STATUS_LABEL: Record<Trip['status'], string> = {
    begonnen: 'Aktiv',
    pausiert: 'Pausiert',
    beendet: 'Beendet',
  }

  // Leere Runs (ohne Positionen) werden in der Übersicht ausgeblendet — ein frisch
  // gestarteter Run ist auf seiner Detailseite trotzdem erreichbar.
  const activeTrips = $derived(trips.filter((t) => t.status !== 'beendet' && t.itemCount > 0))
  const doneTrips = $derived(trips.filter((t) => t.status === 'beendet' && t.itemCount > 0))
  const emptyActiveCount = $derived(trips.filter((t) => t.status !== 'beendet' && t.itemCount === 0).length)

  function tripTitle(t: Trip): string {
    if (t.name) return t.name
    const store = t.store?.name ?? 'Einkauf'
    const d = new Date(t.startedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
    return `${store} · ${d}`
  }

  // ── Neuer Run ──────────────────────────────────────────────────────────
  let newName = $state('')
  let newStoreId = $state('')
  let creating = $state(false)

  async function createTrip() {
    creating = true
    try {
      const res = await apiFetch('/api/shopping-trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() || null, storeId: newStoreId || null }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body?.error ?? `Fehler ${res.status}`)
        return
      }
      newName = ''
      newStoreId = ''
      goto(`/einkauf/${body.id}`)
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      creating = false
    }
  }

  async function resume(t: Trip) {
    const res = await apiFetch(`/api/shopping-trips/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' }),
    })
    if (!res.ok) {
      const b = await res.json().catch(() => ({}))
      toast.error(b?.error ?? 'Fortsetzen nicht möglich.')
      return
    }
    await invalidateAll()
  }
</script>

<div class="page">
  <header class="page-header">
    <h1 class="page-title">Einkauf</h1>
    <p class="page-desc">
      Konkrete Einkäufe mit Status. Bedarf aus der Einkaufsliste wird einem Einkauf zugewiesen
      (reserviert) und nach dem Kauf als Bestand eingebucht.
    </p>
  </header>

  {#if loadError}
    <div class="alert alert--error" role="alert">{loadError}</div>
  {/if}

  <!-- Neuer Run -->
  <section class="card">
    <h2 class="section-title">Neuen Einkauf starten</h2>
    <div class="add-row">
      <input
        class="input"
        type="text"
        bind:value={newName}
        placeholder="Name (optional) — z.B. Wocheneinkauf"
        maxlength="128"
        onkeydown={(e) => { if (e.key === 'Enter') createTrip() }}
        aria-label="Name des Einkaufs"
      />
      <select class="input input--store" bind:value={newStoreId} aria-label="Markt">
        <option value="">Kein Markt</option>
        {#each stores as s (s.id)}
          <option value={s.id}>{s.name}{s.chain ? ` (${s.chain})` : ''}</option>
        {/each}
      </select>
      <button class="btn-primary" type="button" disabled={creating} onclick={createTrip}>
        {creating ? 'Wird gestartet…' : 'Starten'}
      </button>
    </div>
    <p class="hint">Beim Starten wird ein evtl. bereits aktiver Einkauf pausiert (nur einer aktiv).</p>
  </section>

  <!-- Aktive / pausierte Runs -->
  <section class="card">
    <h2 class="section-title">Laufende Einkäufe <span class="section-sub">({activeTrips.length})</span></h2>
    {#if activeTrips.length === 0}
      <p class="empty-hint">Kein laufender Einkauf. Starte oben einen neuen.</p>
    {:else}
      <ul class="trip-list">
        {#each activeTrips as t (t.id)}
          <li class="trip">
            <a class="trip-main" href={`/einkauf/${t.id}`}>
              <span class="trip-name">{tripTitle(t)}</span>
              <span class="trip-meta">
                <span class="status-badge status-badge--{t.status}">{STATUS_LABEL[t.status]}</span>
                {#if t.store}· {t.store.name}{/if}
              </span>
            </a>
            {#if t.status === 'pausiert'}
              <button class="btn-ghost" type="button" onclick={() => resume(t)}>Fortsetzen</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if emptyActiveCount > 0}
      <p class="hint">{emptyActiveCount} leerer Einkauf ausgeblendet (noch ohne Positionen).</p>
    {/if}
  </section>

  <!-- Beendete Runs -->
  {#if doneTrips.length > 0}
    <section class="card">
      <h2 class="section-title">Abgeschlossen <span class="section-sub">({doneTrips.length})</span></h2>
      <ul class="trip-list">
        {#each doneTrips as t (t.id)}
          <li class="trip trip--done">
            <a class="trip-main" href={`/einkauf/${t.id}`}>
              <span class="trip-name">{tripTitle(t)}</span>
              <span class="trip-meta">
                <span class="status-badge status-badge--beendet">{STATUS_LABEL[t.status]}</span>
                {#if t.store}· {t.store.name}{/if}
              </span>
            </a>
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

  .section-title { font-family: var(--font-display); font-size: var(--text-lg); font-weight: 700; color: var(--color-text-primary); margin: 0 0 var(--space-4); }
  .section-sub { font-size: var(--text-xs); font-weight: 500; color: var(--color-text-muted); }
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0; }
  .hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: var(--space-2) 0 0; }

  .add-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .add-row .input:first-child { flex: 1 1 200px; min-width: 0; }
  .input--store { flex: 0 1 180px; }

  .trip-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .trip { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-bottom: 1px solid var(--color-border-subtle); }
  .trip:last-child { border-bottom: none; }
  .trip--done { opacity: 0.7; }
  .trip-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-decoration: none; }
  .trip-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .trip-meta { font-size: var(--text-xs); color: var(--color-text-muted); display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap; }

  .status-badge { display: inline-flex; align-items: center; height: 18px; padding: 0 var(--space-2); border-radius: var(--radius-full); font-size: 10px; font-weight: 700; }
  .status-badge--begonnen { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  .status-badge--pausiert { background: #fef9c3; color: #a16207; }
  .status-badge--beendet { background: var(--color-surface-sunken); color: var(--color-text-muted); }

  @media (max-width: 560px) {
    .page { padding: var(--space-4) var(--space-3) var(--space-12); }
    .card { padding: var(--space-4); }
    .add-row .input:first-child { flex-basis: 100%; }
  }
</style>
