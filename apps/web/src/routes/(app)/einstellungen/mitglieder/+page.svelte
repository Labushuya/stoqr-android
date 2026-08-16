<script lang="ts">
  import { enhance } from '$app/forms'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  let inviteEmail = $state('')
  let inviting = $state(false)
  let removing = $state<string | null>(null)

  const inviteSuccess = $derived(
    form && (form as any).action === 'invite' && (form as any).success
  )
  const inviteError = $derived(
    form && (form as any).action === 'invite' ? (form as any).error : null
  )
  const removeError = $derived(
    form && (form as any).action === 'removeMember' ? (form as any).error : null
  )

  function formatDate(d: unknown): string {
    if (!d) return '–'
    return new Date(d as string).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<div class="page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/einstellungen" class="breadcrumb-link">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Einstellungen
    </a>
    <span class="breadcrumb-sep" aria-hidden="true">/</span>
    <span class="breadcrumb-current">Mitglieder</span>
  </nav>

  <header class="page-header">
    <h1 class="page-title">Haushaltsmitglieder</h1>
    <p class="page-desc">Verwalte die Mitglieder deines Haushalts und verschicke Einladungen.</p>
  </header>

  <!-- ── Members list ─────────────────────────────────────────────────────── -->

  <section class="section">
    <div class="section-header">
      <h2 class="section-title">Mitglieder</h2>
    </div>

    {#if removeError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {removeError}
      </div>
    {/if}

    <div class="member-list">
      {#each data.members as member (member.id)}
        {@const user = (member as any).user}
        <div class="member-row">
          <div class="member-avatar" aria-hidden="true">
            {(user?.displayName ?? user?.email ?? '?').charAt(0).toUpperCase()}
          </div>
          <div class="member-info">
            <span class="member-name">{user?.displayName ?? '–'}</span>
            <span class="member-email">{user?.email ?? '–'}</span>
          </div>
          <div class="member-meta">
            <span class="role-badge" class:role-badge--admin={member.role === 'admin'}>
              {member.role === 'admin' ? 'Admin' : 'Mitglied'}
            </span>
            <span class="joined-at">Beigetreten {formatDate(member.joinedAt)}</span>
          </div>
          {#if data.role === 'admin' && user?.id !== data.currentUserId}
            <form
              method="POST"
              action="?/removeMember"
              use:enhance={() => {
                removing = user?.id
                return async ({ update }) => {
                  await update()
                  removing = null
                }
              }}
            >
              <input type="hidden" name="userId" value={user?.id} />
              <button
                class="btn-remove"
                type="submit"
                disabled={removing === user?.id}
                aria-label="{user?.displayName ?? user?.email} entfernen"
              >
                {#if removing === user?.id}
                  <span class="spinner" aria-hidden="true"></span>
                {:else}
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                    <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                {/if}
                Entfernen
              </button>
            </form>
          {/if}
        </div>
      {/each}
    </div>
  </section>

  <!-- ── Invite section (admin only) ──────────────────────────────────────── -->

  {#if data.role === 'admin'}
    <section class="section">
      <div class="section-header">
        <h2 class="section-title">Mitglied einladen</h2>
        <p class="section-desc">
          Sende einen Einladungslink per E-Mail. Der Link ist 7 Tage gültig.
        </p>
      </div>

      {#if inviteError}
        <div class="alert alert--error" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {inviteError}
        </div>
      {/if}

      {#if inviteSuccess}
        <div class="alert alert--success" role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Einladung erstellt.
        </div>
        <div class="invite-link-box">
          <span class="invite-link-label">Einladungslink:</span>
          <input
            class="invite-link-input"
            type="text"
            readonly
            value={(form as any).inviteLink}
            onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
          />
          <button
            class="btn-copy"
            type="button"
            onclick={() => navigator.clipboard.writeText((form as any).inviteLink)}
          >
            Kopieren
          </button>
        </div>
      {/if}

      <form
        method="POST"
        action="?/invite"
        use:enhance={() => {
          inviting = true
          return async ({ update }) => {
            await update({ reset: false })
            inviting = false
            inviteEmail = ''
          }
        }}
      >
        <div class="invite-form">
          <div class="field">
            <label class="label" for="invite-email">E-Mail-Adresse</label>
            <input
              id="invite-email"
              class="input"
              type="email"
              name="email"
              autocomplete="off"
              placeholder="person@example.com"
              bind:value={inviteEmail}
              required
              disabled={inviting}
            />
          </div>
          <button class="btn-primary" type="submit" disabled={inviting}>
            {#if inviting}
              <span class="spinner" aria-hidden="true"></span>
              Einladen...
            {:else}
              Einladen
            {/if}
          </button>
        </div>
      </form>

      <p class="invite-hint">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        stoqr versendet keine E-Mails. Den Einladungslink bitte manuell per Nachricht teilen.
      </p>
    </section>

    <!-- ── Open invites ────────────────────────────────────────────────────── -->

    {#if data.openInvites.length > 0}
      <section class="section">
        <div class="section-header">
          <h2 class="section-title">Offene Einladungen</h2>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th">E-Mail</th>
                <th class="th">Ablauf</th>
              </tr>
            </thead>
            <tbody>
              {#each data.openInvites as invite (invite.id)}
                <tr class="tr">
                  <td class="td">{invite.email}</td>
                  <td class="td td--muted">{formatDate(invite.expiresAt)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}
  {/if}
</div>

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
    font-size: var(--text-sm);
  }
  .breadcrumb-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast);
  }
  .breadcrumb-link:hover { color: var(--color-primary); }
  .breadcrumb-sep { color: var(--color-text-muted); }
  .breadcrumb-current { color: var(--color-text-primary); font-weight: 500; }

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
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
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* ── Section ──────────────────────────────────────────────────────────── */

  .section {
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
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-1);
    letter-spacing: -0.01em;
  }

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.5;
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

  .alert--success {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
    border: 1px solid rgba(22, 163, 74, 0.2);
  }

  /* ── Member list ──────────────────────────────────────────────────────── */

  .member-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-subtle, var(--color-border));
    background-color: var(--color-surface);
    flex-wrap: wrap;
  }

  .member-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: var(--text-sm);
    flex-shrink: 0;
  }

  .member-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .member-name {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-email {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  /* ── Role badge ───────────────────────────────────────────────────────── */

  .role-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    background-color: var(--color-surface-sunken);
    color: var(--color-text-secondary);
  }

  .role-badge--admin {
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
  }

  .joined-at {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* ── Remove button ────────────────────────────────────────────────────── */

  .btn-remove {
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
    flex-shrink: 0;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-remove:hover:not(:disabled) {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  .btn-remove:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Invite form ──────────────────────────────────────────────────────── */

  .invite-form {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
    flex-wrap: wrap;
  }

  .invite-form .field {
    flex: 1;
    min-width: 200px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
  }

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
    width: 100%;
    box-sizing: border-box;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Invite link result ───────────────────────────────────────────────── */

  .invite-link-box {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--color-surface-sunken);
    border: 1px solid var(--color-border);
    margin-bottom: var(--space-5);
    flex-wrap: wrap;
  }

  .invite-link-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .invite-link-input {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--color-text-primary);
    background-color: transparent;
    border: none;
    outline: none;
    flex: 1;
    min-width: 0;
    cursor: text;
    padding: 0;
  }

  .btn-copy {
    display: inline-flex;
    align-items: center;
    height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface-raised);
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: background-color var(--transition-fast);
  }

  .btn-copy:hover {
    background-color: var(--color-surface);
  }

  /* ── Primary button ───────────────────────────────────────────────────── */

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
    flex-shrink: 0;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  /* ── Table ────────────────────────────────────────────────────────────── */

  .table-wrap {
    overflow-x: auto;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .th {
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-surface-sunken);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .tr {
    border-bottom: 1px solid var(--color-border-subtle, var(--color-border));
  }

  .tr:last-child {
    border-bottom: none;
  }

  .td {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text-primary);
    vertical-align: middle;
  }

  .td--muted {
    color: var(--color-text-muted);
  }

  /* ── Spinner ──────────────────────────────────────────────────────────── */

  .spinner {
    display: inline-block;
    width: 13px;
    height: 13px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Invite hint ──────────────────────────────────────────────────────── */

  .invite-hint {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-top: var(--space-3);
    line-height: 1.5;
  }
  .invite-hint svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--color-warning);
  }

  /* ── Responsive ───────────────────────────────────────────────────────── */

  @media (max-width: 560px) {
    .page {
      padding: var(--space-5) var(--space-3) var(--space-12);
    }

    .section {
      padding: var(--space-4);
    }

    .member-row {
      gap: var(--space-2);
    }

    .member-meta {
      align-items: flex-start;
    }

    .invite-form {
      flex-direction: column;
      align-items: stretch;
    }

    .btn-primary {
      justify-content: center;
    }
  }
</style>
