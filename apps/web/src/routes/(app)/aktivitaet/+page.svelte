<script lang="ts">
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()

  type Entry = {
    id: string
    action: 'INSERT' | 'UPDATE' | 'DELETE'
    tableName: string
    recordId: string
    oldValues: Record<string, unknown> | null
    newValues: Record<string, unknown> | null
    changedFields: string[] | null
    createdAt: string
    userId: string | null
    userName: string | null
  }

  const entries = $derived((data.entries as Entry[]) ?? [])
  const loadError = $derived(data.loadError as string | null)

  // ── Labels ─────────────────────────────────────────────────────────────────

  const TABLE_LABELS: Record<string, string> = {
    products: 'Artikel',
    inventory_items: 'Bestand',
    stock_targets: 'Soll-Bestand',
    units: 'Einheit',
    stores: 'Markt',
    locations: 'Raum',
    storages: 'Lagerort',
    places: 'Lagerplatz',
    shopping_list_items: 'Einkaufsliste',
    product_stores: 'Artikel-Markt-Zuordnung',
    shopping_trips: 'Einkauf',
    shopping_trip_items: 'Einkauf-Position',
    product_prices: 'Preis',
  }

  const ACTION_LABELS: Record<Entry['action'], string> = {
    INSERT: 'angelegt',
    UPDATE: 'geändert',
    DELETE: 'gelöscht',
  }

  // Fachliche Feld-Labels für die Vorher→Nachher-Anzeige.
  const FIELD_LABELS: Record<string, string> = {
    name: 'Name',
    brand: 'Marke',
    gtin: 'EAN',
    categoryId: 'Kategorie',
    defaultUnit: 'Standard-Einheit',
    notes: 'Notizen',
    description: 'Beschreibung',
    quantity: 'Menge',
    unit: 'Einheit',
    storeId: 'Markt',
    placeId: 'Lagerplatz',
    bestBeforeDate: 'MHD',
    productId: 'Artikel',
    targetQuantity: 'Soll-Menge',
    minQuantity: 'Mindestbestand',
    symbol: 'Symbol',
    dimension: 'Dimension',
    toBaseFactor: 'Umrechnungsfaktor',
    chain: 'Kette',
    icon: 'Icon',
    consumedAmount: 'Verbraucht',
    locationId: 'Raum',
    storageId: 'Lagerort',
    status: 'Status',
    realStatus: 'Kaufstatus',
    tripId: 'Einkauf',
    priceCt: 'Preis (Cent)',
    isReduced: 'Reduziert',
    isCurrent: 'Aktueller Preis',
    source: 'Quelle',
    scrapeUrl: 'Abruf-URL',
  }

  function tableLabel(t: string): string {
    return TABLE_LABELS[t] ?? t
  }

  function fieldLabel(f: string): string {
    return FIELD_LABELS[f] ?? f
  }

  function fmtValue(v: unknown): string {
    if (v === null || v === undefined || v === '') return '—'
    if (typeof v === 'boolean') return v ? 'ja' : 'nein'
    return String(v)
  }

  // ── Grouping nach Tag ────────────────────────────────────────────────────

  function dayKey(iso: string): string {
    return new Date(iso).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }

  function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  const grouped = $derived.by(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const k = dayKey(e.createdAt)
      const arr = map.get(k)
      if (arr) arr.push(e)
      else map.set(k, [e])
    }
    return [...map.entries()]
  })

  // Nur tatsächlich geänderte Felder mit Vorher/Nachher; sinnvoll für UPDATE.
  function changes(e: Entry): { field: string; from: unknown; to: unknown }[] {
    const fields =
      e.changedFields && e.changedFields.length > 0
        ? e.changedFields
        : Object.keys(e.newValues ?? {})
    return fields.map((f) => ({
      field: f,
      from: e.oldValues?.[f],
      to: e.newValues?.[f],
    }))
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
    <span class="breadcrumb-current" aria-current="page">Aktivität</span>
  </nav>

  <header class="page-header">
    <h1 class="page-title">Aktivität</h1>
    <p class="page-desc">
      Änderungsprotokoll deines Haushalts — wer hat wann welchen Datensatz angelegt,
      geändert oder gelöscht. Neueste zuerst.
    </p>
  </header>

  {#if loadError}
    <div class="alert alert--error" role="alert">{loadError}</div>
  {:else if entries.length === 0}
    <div class="empty-hint">Noch keine Aktivität aufgezeichnet.</div>
  {:else}
    {#each grouped as [day, dayEntries] (day)}
      <section class="day-group">
        <h2 class="day-title">{day}</h2>
        <ul class="entry-list">
          {#each dayEntries as e (e.id)}
            <li class="entry">
              <span class="action-badge action-badge--{e.action.toLowerCase()}">
                {ACTION_LABELS[e.action]}
              </span>
              <div class="entry-body">
                <div class="entry-head">
                  <span class="entry-table">{tableLabel(e.tableName)}</span>
                  <span class="entry-meta">
                    {e.userName ?? 'System'} · {timeLabel(e.createdAt)}
                  </span>
                </div>

                {#if e.action === 'UPDATE'}
                  <ul class="change-list">
                    {#each changes(e) as c (c.field)}
                      <li class="change">
                        <span class="change-field">{fieldLabel(c.field)}:</span>
                        <span class="change-from">{fmtValue(c.from)}</span>
                        <span class="change-arrow" aria-hidden="true">→</span>
                        <span class="change-to">{fmtValue(c.to)}</span>
                      </li>
                    {/each}
                  </ul>
                {:else if e.action === 'INSERT' && e.newValues}
                  <div class="value-summary">
                    {#each Object.entries(e.newValues) as [k, v] (k)}
                      {#if v !== null && v !== undefined && v !== ''}
                        <span class="value-chip">{fieldLabel(k)}: {fmtValue(v)}</span>
                      {/if}
                    {/each}
                  </div>
                {:else if e.action === 'DELETE' && e.oldValues}
                  <div class="value-summary">
                    {#each Object.entries(e.oldValues) as [k, v] (k)}
                      {#if v !== null && v !== undefined && v !== ''}
                        <span class="value-chip value-chip--deleted">{fieldLabel(k)}: {fmtValue(v)}</span>
                      {/if}
                    {/each}
                  </div>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

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
  }

  .breadcrumb-sep {
    color: var(--color-text-muted);
    user-select: none;
  }

  .breadcrumb-current {
    color: var(--color-text-secondary);
    font-weight: 500;
  }

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

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-4) 0;
  }

  .alert--error {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }

  /* ── Day group ──────────────────────────────────────────────────────── */

  .day-group {
    margin-bottom: var(--space-6);
  }

  .day-title {
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }

  .entry-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .entry {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
  }

  .action-badge {
    flex-shrink: 0;
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .action-badge--insert {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  .action-badge--update {
    background-color: #dbeafe;
    color: #1d4ed8;
  }

  .action-badge--delete {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
  }

  .entry-body {
    flex: 1;
    min-width: 0;
  }

  .entry-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .entry-table {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .entry-meta {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  .change-list {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .change {
    font-size: var(--text-xs);
    color: var(--color-text-secondary);
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    flex-wrap: wrap;
  }

  .change-field {
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .change-from {
    color: var(--color-text-muted);
    text-decoration: line-through;
  }

  .change-arrow {
    color: var(--color-text-muted);
  }

  .change-to {
    color: var(--color-text-primary);
    font-weight: 500;
  }

  .value-summary {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .value-chip {
    font-size: 11px;
    padding: 1px var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }

  .value-chip--deleted {
    text-decoration: line-through;
    color: var(--color-text-muted);
  }

  @media (max-width: 560px) {
    .page {
      padding: var(--space-5) var(--space-3) var(--space-12);
    }
  }
</style>
