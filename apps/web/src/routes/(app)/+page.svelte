<script lang="ts">
  import type { PageData } from './$types'
  import { getDaysRemaining, getExpiryLabel, getExpiryStatus, EXPIRY_CLASS } from '$lib/utils/expiry'

  // ── Types ──────────────────────────────────────────────────────────────────

  type Place = {
    id: string
    name: string
    icon: string | null
    storage: {
      id: string
      name: string
      icon: string | null
      storageType: string | null
      temperatureZone: string | null
      location: {
        id: string
        name: string
        icon: string | null
      }
    }
  }

  type DashItem = {
    id: string
    bestBeforeDate: string | null
    quantity: string
    unit: string
    place: Place | null
    product: {
      id: string
      name: string
      brand: string | null
      imageUrl: string | null
    }
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Derived ────────────────────────────────────────────────────────────────

  const greeting = $derived(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Guten Morgen'
    if (hour < 18) return 'Guten Tag'
    return 'Guten Abend'
  })

  const username = $derived(() => {
    const user = data.user as { name?: string; email?: string; displayName?: string } | null
    return user?.displayName ?? user?.name ?? user?.email ?? 'Nutzer'
  })

  // Expiry config constants (matching inventar page defaults)
  const YELLOW_DAYS = 7
  const RED_DAYS = 2
  const TOLERANCE_DAYS = 0

  // ── Helpers ────────────────────────────────────────────────────────────────

  function daysRemaining(item: DashItem): number {
    if (!item.bestBeforeDate) return Infinity
    return getDaysRemaining(new Date(item.bestBeforeDate), TOLERANCE_DAYS)
  }

  function expiryBadgeClass(item: DashItem): string {
    if (!item.bestBeforeDate) return 'mhd-fresh'
    const date = new Date(item.bestBeforeDate)
    const status = getExpiryStatus(date, TOLERANCE_DAYS, {
      yellowDaysBefore: YELLOW_DAYS,
      redDaysBefore: RED_DAYS,
    })
    return EXPIRY_CLASS[status]
  }

  function expiryBadgeLabel(item: DashItem): string {
    if (!item.bestBeforeDate) return 'Kein MHD'
    const days = daysRemaining(item)
    const date = new Date(item.bestBeforeDate)
    const status = getExpiryStatus(date, TOLERANCE_DAYS, {
      yellowDaysBefore: YELLOW_DAYS,
      redDaysBefore: RED_DAYS,
    })
    return getExpiryLabel(status, days)
  }

  function placeBreadcrumb(item: DashItem): string {
    if (!item.place) return ''
    return `${item.place.storage.location.name} › ${item.place.storage.name} › ${item.place.name}`
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  // ── Scroll helpers ─────────────────────────────────────────────────────────

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
</script>

<!-- ── Page ──────────────────────────────────────────────────────────────── -->

<div class="page">

  <!-- Greeting -->
  <div class="greeting-row">
    <div>
      <h1 class="greeting">{greeting()}, {username()}!</h1>
      <p class="greeting-sub">Hier ist dein Überblick.</p>
    </div>
  </div>

  <!-- Stats row -->
  <div class="stats-grid">
    <!-- Gesamtbestand -->
    <div class="stat-card stat-card--olive">
      <div class="stat-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <rect x="3" y="5" width="16" height="13" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/>
          <path d="M7 9h8M7 13h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
          <path d="M7 5V3.5a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 .5.5V5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="stat-body">
        <span class="stat-value">{data.stats.totalItems}</span>
        <span class="stat-label">Gesamtbestand</span>
      </div>
    </div>

    <!-- Bald ablaufend -->
    <button
      class="stat-card stat-card--amber stat-card--clickable"
      type="button"
      onclick={() => scrollTo('section-expiring')}
      aria-label="Zu bald ablaufenden Artikeln springen"
    >
      <div class="stat-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8" fill="none"/>
          <path d="M11 7v4l2.5 2.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="stat-body">
        <span class="stat-value">{data.stats.expiringThisWeek}</span>
        <span class="stat-label">Bald ablaufend</span>
      </div>
    </button>

    <!-- Abgelaufen -->
    <button
      class="stat-card stat-card--red stat-card--clickable"
      type="button"
      onclick={() => scrollTo('section-expired')}
      aria-label="Zu abgelaufenen Artikeln springen"
    >
      <div class="stat-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="1.8" fill="none"/>
          <path d="M11 7v5M11 14.5v.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </div>
      <div class="stat-body">
        <span class="stat-value">{data.stats.expiredCount}</span>
        <span class="stat-label">Bereits abgelaufen</span>
      </div>
    </button>

    <!-- Orte -->
    <div class="stat-card stat-card--green">
      <div class="stat-icon" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path d="M11 3C7.686 3 5 5.686 5 9c0 5 6 10 6 10s6-5 6-10c0-3.314-2.686-6-6-6Z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
          <circle cx="11" cy="9" r="2.5" stroke="currentColor" stroke-width="1.8" fill="none"/>
        </svg>
      </div>
      <div class="stat-body">
        <span class="stat-value">{data.stats.locationCount}</span>
        <span class="stat-label">Räume</span>
      </div>
    </div>
  </div>

  <!-- Quick actions -->
  <div class="quick-actions">
    <a href="/inventar" class="qa-btn qa-btn--primary">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      Artikel hinzufügen
    </a>
    <a href="/orte" class="qa-btn qa-btn--secondary">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2C5.24 2 3 4.24 3 7c0 4 5 7 5 7s5-3 5-7c0-2.76-2.24-5-5-5Z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/>
        <circle cx="8" cy="7" r="1.8" stroke="currentColor" stroke-width="1.6" fill="none"/>
      </svg>
      Räume verwalten
    </a>
  </div>

  <!-- Bald ablaufend section -->
  <section id="section-expiring" class="list-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-dot section-dot--amber" aria-hidden="true"></span>
        Bald ablaufend
        <span class="section-meta">nächste 14 Tage</span>
      </h2>
      {#if data.expiringSoon.length > 0}
        <span class="section-count">{data.expiringSoon.length}</span>
      {/if}
    </div>

    {#if data.expiringSoon.length === 0}
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">🎉</span>
        <span class="empty-label">Alles frisch!</span>
      </div>
    {:else}
      <ul class="item-list" role="list">
        {#each data.expiringSoon as item (item.id)}
          {@const breadcrumb = placeBreadcrumb(item as DashItem)}
          <li>
            <a href="/inventar/{item.id}" class="item-row item-row--warn">
              <span class="item-left">
                <span class="item-name">{item.product.name}</span>
                {#if breadcrumb}
                  <span class="item-location">{breadcrumb}</span>
                {/if}
              </span>
              <span class="item-right">
                <span class="item-date">{formatDate(item.bestBeforeDate)}</span>
                <span class="mhd-badge {expiryBadgeClass(item as DashItem)}">
                  {expiryBadgeLabel(item as DashItem)}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <!-- Bereits abgelaufen section -->
  <section id="section-expired" class="list-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-dot section-dot--red" aria-hidden="true"></span>
        Bereits abgelaufen
      </h2>
      {#if data.expired.length > 0}
        <span class="section-count section-count--red">{data.expired.length}</span>
      {/if}
    </div>

    {#if data.expired.length === 0}
      <div class="empty-state">
        <span class="empty-emoji" aria-hidden="true">✅</span>
        <span class="empty-label">Nichts abgelaufen</span>
      </div>
    {:else}
      <ul class="item-list" role="list">
        {#each data.expired as item (item.id)}
          {@const breadcrumb = placeBreadcrumb(item as DashItem)}
          <li>
            <a href="/inventar/{item.id}" class="item-row item-row--danger">
              <span class="item-left">
                <span class="item-name">{item.product.name}</span>
                {#if breadcrumb}
                  <span class="item-location">{breadcrumb}</span>
                {/if}
              </span>
              <span class="item-right">
                <span class="item-date">{formatDate(item.bestBeforeDate)}</span>
                <span class="mhd-badge mhd-expired">
                  {expiryBadgeLabel(item as DashItem)}
                </span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  </section>

</div>

<style>
  /* ── Page layout ──────────────────────────────────────────────────────── */

  .page {
    max-width: 900px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
  }

  /* ── Greeting ─────────────────────────────────────────────────────────── */

  .greeting-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .greeting {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.025em;
    margin: 0;
    line-height: 1.2;
  }

  .greeting-sub {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: var(--space-1) 0 0;
  }

  /* ── Stats grid ───────────────────────────────────────────────────────── */

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-3);
  }

  @media (min-width: 600px) {
    .stats-grid {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  /* ── Stat card ────────────────────────────────────────────────────────── */

  .stat-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid transparent;
    box-shadow: var(--shadow-sm);
    background-color: var(--color-surface-raised);
    text-decoration: none;
    user-select: none;
  }

  .stat-card--clickable {
    cursor: pointer;
    transition: box-shadow var(--transition-fast), transform var(--transition-fast), border-color var(--transition-fast);
    /* Reset button styles */
    font-family: inherit;
    font-size: inherit;
    text-align: left;
    width: 100%;
  }

  .stat-card--clickable:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .stat-card--clickable:active {
    transform: translateY(0);
  }

  /* Olive — Gesamtbestand */
  .stat-card--olive {
    background-color: var(--color-accent-subtle);
    border-color: var(--color-border-subtle);
  }

  .stat-card--olive .stat-icon {
    color: var(--color-accent);
    background-color: rgba(74, 74, 53, 0.12);
  }

  .stat-card--olive .stat-value {
    color: var(--color-accent);
  }

  /* Amber — Bald ablaufend */
  .stat-card--amber {
    background-color: var(--color-warning-subtle);
    border-color: rgba(229, 160, 32, 0.2);
  }

  .stat-card--amber .stat-icon {
    color: var(--color-warning);
    background-color: rgba(229, 160, 32, 0.15);
  }

  .stat-card--amber .stat-value {
    color: var(--color-warning);
  }

  /* Red — Abgelaufen */
  .stat-card--red {
    background-color: var(--color-danger-subtle);
    border-color: rgba(176, 58, 46, 0.2);
  }

  .stat-card--red .stat-icon {
    color: var(--color-danger);
    background-color: rgba(176, 58, 46, 0.12);
  }

  .stat-card--red .stat-value {
    color: var(--color-danger);
  }

  /* Green — Orte */
  .stat-card--green {
    background-color: var(--color-secondary-subtle);
    border-color: rgba(122, 158, 126, 0.2);
  }

  .stat-card--green .stat-icon {
    color: var(--color-secondary);
    background-color: rgba(122, 158, 126, 0.15);
  }

  .stat-card--green .stat-value {
    color: var(--color-secondary);
  }

  /* Stat parts */
  .stat-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }

  .stat-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .stat-label {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Quick actions ────────────────────────────────────────────────────── */

  .quick-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .qa-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 38px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
  }

  .qa-btn--primary {
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    border: none;
  }

  .qa-btn--primary:hover {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .qa-btn--secondary {
    background-color: transparent;
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  .qa-btn--secondary:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  /* ── List section ─────────────────────────────────────────────────────── */

  .list-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.015em;
    margin: 0;
  }

  .section-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .section-dot--amber {
    background-color: var(--color-warning);
  }

  .section-dot--red {
    background-color: var(--color-danger);
  }

  .section-meta {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
    font-family: var(--font-body);
  }

  .section-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-warning-subtle);
    color: var(--color-warning);
    font-size: var(--text-xs);
    font-weight: 700;
    flex-shrink: 0;
  }

  .section-count--red {
    background-color: var(--color-danger-subtle);
    color: var(--color-danger);
  }

  /* ── Item list ────────────────────────────────────────────────────────── */

  .item-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  /* ── Item row ─────────────────────────────────────────────────────────── */

  .item-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    text-decoration: none;
    color: inherit;
    border-bottom: 1px solid var(--color-border-subtle);
    transition: background-color var(--transition-fast);
    min-width: 0;
  }

  li:last-child .item-row {
    border-bottom: none;
  }

  .item-row:hover {
    background-color: var(--color-surface-sunken);
  }

  .item-row--warn:hover {
    background-color: var(--color-warning-subtle);
  }

  .item-row--danger:hover {
    background-color: var(--color-danger-subtle);
  }

  .item-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .item-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-location {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-shrink: 0;
  }

  .item-date {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  /* ── MHD badge (reuse global classes, scoped override for inline display) */

  :global(.mhd-badge) {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    white-space: nowrap;
    width: fit-content;
  }

  /* ── Empty state ──────────────────────────────────────────────────────── */

  .empty-state {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-5);
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .empty-emoji {
    font-size: 1.4rem;
    line-height: 1;
    flex-shrink: 0;
  }

  .empty-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  /* ── Responsive ───────────────────────────────────────────────────────── */

  @media (max-width: 480px) {
    .page {
      padding: var(--space-5) var(--space-4) var(--space-12);
      gap: var(--space-6);
    }

    .greeting {
      font-size: var(--text-xl);
    }

    .stats-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: var(--space-2);
    }

    .stat-card {
      padding: var(--space-3);
      gap: var(--space-2);
    }

    .stat-icon {
      width: 34px;
      height: 34px;
    }

    .stat-value {
      font-size: var(--text-lg);
    }

    .item-row {
      padding: var(--space-3);
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .item-right {
      width: 100%;
      justify-content: flex-end;
    }

    .item-date {
      display: none;
    }

    .quick-actions {
      gap: var(--space-2);
    }

    .qa-btn {
      flex: 1;
      justify-content: center;
    }
  }
</style>
