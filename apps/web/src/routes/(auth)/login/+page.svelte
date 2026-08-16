<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'

  let email = $state('')
  let password = $state('')
  let error = $state('')
  let loading = $state(false)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = ''
    loading = true

    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        error = data?.message ?? 'Anmeldung fehlgeschlagen. Bitte prüfe deine Eingaben.'
        return
      }

      await invalidateAll()
      goto('/')
    } catch {
      error = 'Netzwerkfehler. Bitte versuche es erneut.'
    } finally {
      loading = false
    }
  }
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

    <h1 class="heading">Willkommen zurück</h1>
    <p class="subheading">Melde dich an, um dein Inventar zu verwalten.</p>

    <!-- Error -->
    {#if error}
      <div class="error-box" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" flex-shrink="0">
          <circle cx="8" cy="8" r="7" stroke="var(--color-danger)" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="var(--color-danger)" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {error}
      </div>
    {/if}

    <form onsubmit={handleSubmit} novalidate>
      <div class="field">
        <label class="label" for="email">E-Mail</label>
        <input
          id="email"
          class="input"
          type="email"
          autocomplete="email"
          placeholder="name@example.com"
          required
          bind:value={email}
          disabled={loading}
        />
      </div>

      <div class="field">
        <label class="label" for="password">Passwort</label>
        <input
          id="password"
          class="input"
          type="password"
          autocomplete="current-password"
          placeholder="••••••••"
          required
          bind:value={password}
          disabled={loading}
        />
      </div>

      <button class="btn-primary" type="submit" disabled={loading}>
        {#if loading}
          <span class="spinner" aria-hidden="true"></span>
          Anmelden...
        {:else}
          Anmelden
        {/if}
      </button>
    </form>
    <p style="text-align:center; margin-top: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted);">
      Neu hier? <a href="/register" style="color: var(--color-primary);">Konto erstellen</a>
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

  /* ── Responsive ──────────────────────────────────── */

  @media (max-width: 480px) {
    .card {
      padding: var(--space-8) var(--space-6);
      border-radius: var(--radius-lg);
    }
  }
</style>
