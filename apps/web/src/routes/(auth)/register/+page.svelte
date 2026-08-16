<script lang="ts">
  import { enhance } from '$app/forms'
  import type { PageData, ActionData } from './$types'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  let loading = $state(false)
  // svelte-ignore state_referenced_locally
  let tokenValue = $state((data as any).token ?? '')
</script>

<div class="page">
  <div class="card">
    <!-- Wordmark -->
    <div class="brand">
      <span class="brand-icon" aria-hidden="true">
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="8" fill="var(--color-primary)"/>
          <path
            d="M10 12h12M10 16h8M10 20h10"
            stroke="var(--color-text-inverse)"
            stroke-width="2"
            stroke-linecap="round"
          />
          <circle cx="23" cy="20" r="3" fill="var(--color-text-inverse)" opacity="0.9"/>
        </svg>
      </span>
      <span class="brand-name">stoqr</span>
    </div>

    <h1 class="heading">Konto erstellen</h1>
    <p class="subheading">Richte deinen Haushalt ein und starte mit stoqr.</p>

    <!-- Invite banner — token present and valid -->
    {#if (data as any).token}
      <div class="invite-banner" role="status">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 7v4M8 5v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Du wurdest eingeladen. Erstelle jetzt dein Konto.
      </div>
    {/if}

    <!-- Warning — no token and not first user -->
    {#if !(data as any).token && !(data as any).isFirstUser}
      <div class="warn-box" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        <span>
          Für die Registrierung wird ein Einladungslink benötigt. Bitte öffne den Link aus der
          Einladungs-E-Mail oder frage den Administrator nach einem Einladungslink.
        </span>
      </div>
    {/if}

    {#if (data as any).tokenInvalid}
      <div class="error-box" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0">
          <circle cx="8" cy="8" r="7" stroke="var(--color-danger)" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="var(--color-danger)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Der Einladungslink ist ungültig oder abgelaufen.
      </div>
    {/if}

    <!-- Error from form action -->
    {#if form?.error}
      <div class="error-box" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" style="flex-shrink:0">
          <circle cx="8" cy="8" r="7" stroke="var(--color-danger)" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="var(--color-danger)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {(form as any).error}
      </div>
    {/if}

    <form
      method="POST"
      action="?/register"
      use:enhance={() => {
        loading = true
        return async ({ update }) => {
          await update()
          loading = false
        }
      }}
      novalidate
    >
      <!-- Visible token field — hidden only when token is pre-filled from URL -->
      {#if (data as any).token}
        <input type="hidden" name="token" value={(data as any).token} />
      {:else}
        <div class="field">
          <label class="label" for="token">Einladungscode</label>
          <input
            id="token"
            class="input"
            type="text"
            name="token"
            autocomplete="off"
            placeholder="Einladungstoken aus dem Link"
            bind:value={tokenValue}
            disabled={loading}
          />
        </div>
      {/if}

      <div class="field">
        <label class="label" for="name">Name</label>
        <input
          id="name"
          class="input"
          type="text"
          name="name"
          autocomplete="name"
          placeholder="Dein Name"
          required
          disabled={loading}
        />
      </div>

      <div class="field">
        <label class="label" for="email">E-Mail</label>
        <input
          id="email"
          class="input"
          type="email"
          name="email"
          autocomplete="email"
          placeholder="name@example.com"
          value={(data as any).inviteEmail ?? ''}
          required
          disabled={loading || !!(data as any).inviteEmail}
        />
      </div>

      <div class="field">
        <label class="label" for="password">Passwort</label>
        <input
          id="password"
          class="input"
          type="password"
          name="password"
          autocomplete="new-password"
          placeholder="Mindestens 8 Zeichen"
          minlength="8"
          required
          disabled={loading}
        />
      </div>

      <button class="btn-primary" type="submit" disabled={loading}>
        {#if loading}
          <span class="spinner" aria-hidden="true"></span>
          Registrieren...
        {:else}
          Konto erstellen
        {/if}
      </button>
    </form>

    <p class="footer-link">
      Bereits registriert? <a href="/login">Anmelden</a>
    </p>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-base);
    padding: var(--space-6);
  }

  /* ── Card ────────────────────────────────────────── */

  .card {
    width: 100%;
    max-width: 400px;
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-10) var(--space-8);
    box-shadow: var(--shadow-lg);
  }

  /* ── Brand ───────────────────────────────────────── */

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-8);
  }

  .brand-icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .brand-name {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-accent);
    letter-spacing: -0.03em;
    line-height: 1;
  }

  /* ── Heading ─────────────────────────────────────── */

  .heading {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
    letter-spacing: -0.02em;
  }

  .subheading {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-8);
    line-height: 1.5;
  }

  /* ── Invite banner ───────────────────────────────── */

  .invite-banner {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--color-primary-subtle);
    border: 1px solid var(--color-primary);
    color: var(--color-primary);
    font-size: var(--text-sm);
    font-weight: 500;
    line-height: 1.5;
    margin-bottom: var(--space-6);
  }

  /* ── Warning box ─────────────────────────────────── */

  .warn-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--color-warning-subtle, #fef9c3);
    border: 1px solid var(--color-warning, #ca8a04);
    color: var(--color-warning-text, #854d0e);
    font-size: var(--text-sm);
    line-height: 1.5;
    margin-bottom: var(--space-6);
  }

  /* ── Error box ───────────────────────────────────── */

  .error-box {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--color-danger-subtle);
    border: 1px solid var(--color-danger);
    color: var(--color-danger);
    font-size: var(--text-sm);
    line-height: 1.5;
    margin-bottom: var(--space-6);
  }

  /* ── Form ────────────────────────────────────────── */

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
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
    height: 42px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition:
      border-color var(--transition-fast),
      box-shadow var(--transition-fast),
      background-color var(--transition-fast);
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:hover:not(:disabled) {
    border-color: var(--color-border-strong);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
    background-color: var(--color-surface-raised);
  }

  .input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── Primary button ──────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 44px;
    padding: 0 var(--space-6);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-base);
    font-weight: 600;
    cursor: pointer;
    margin-top: var(--space-2);
    transition:
      background-color var(--transition-fast),
      box-shadow var(--transition-fast),
      opacity var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:active:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-sm);
  }

  .btn-primary:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  /* ── Spinner ─────────────────────────────────────── */

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(245, 240, 232, 0.35);
    border-top-color: var(--color-text-inverse);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Footer link ─────────────────────────────────── */

  .footer-link {
    margin: var(--space-6) 0 0;
    text-align: center;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .footer-link a {
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
  }

  .footer-link a:hover {
    text-decoration: underline;
  }

  /* ── Responsive ──────────────────────────────────── */

  @media (max-width: 480px) {
    .card {
      padding: var(--space-8) var(--space-6);
      border-radius: var(--radius-lg);
    }
  }
</style>
