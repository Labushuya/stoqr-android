<script lang="ts">
  import '../app.css'
  import { page } from '$app/stores'
  import { goto, invalidateAll } from '$app/navigation'
  import Toast from '$lib/components/Toast.svelte'
  import { apiFetch } from '$lib/client/api'

  let { data, children } = $props()

  let menuOpen = $state(false)

  // Dark mode — SSR-safe: initialize to false, read localStorage only on client after hydration
  let darkMode = $state(false)

  $effect(() => {
    // Runs only on the client after hydration — localStorage is safe here
    const stored = localStorage.getItem('stoqr-theme')
    if (stored === 'dark') {
      darkMode = true
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  })

  function toggleDarkMode() {
    darkMode = !darkMode
    localStorage.setItem('stoqr-theme', darkMode ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : '')
  }

  // ── Versions-/Update-Check (nur Information) ────────────────────────────────
  type VersionInfo = {
    current: { gitShaShort: string; buildTime: string }
    latest: { gitShaShort: string } | null
    updateAvailable: boolean | null
    reason?: string
  }
  let versionShort = $state('…')
  let checkState = $state<'idle' | 'checking' | 'current' | 'update' | 'unknown'>('idle')
  let checkMsg = $state('')

  $effect(() => {
    // Laufende Version einmalig laden (nur die kurze SHA fürs Badge).
    apiFetch('/api/version')
      .then((r) => r.json())
      .then((v: VersionInfo) => { versionShort = v.current?.gitShaShort ?? 'unbekannt' })
      .catch(() => { versionShort = 'unbekannt' })
  })

  // Uebersetzt den reason des /api/version-Endpunkts in eine verstaendliche Ursache.
  function updateCheckReason(reason?: string): string {
    if (reason === 'fetch-failed') return 'Prüfung nicht möglich — kein Internetzugang zu GitHub'
    if (reason === 'no-build-sha') return 'Prüfung nicht möglich — Build ohne Versions-SHA'
    if (reason?.startsWith('github-')) {
      const code = reason.slice('github-'.length)
      if (code === '403') return 'Prüfung nicht möglich — GitHub-Rate-Limit (später erneut versuchen)'
      return `Prüfung nicht möglich — GitHub antwortete mit ${code}`
    }
    return 'Prüfung nicht möglich'
  }

  async function checkForUpdate() {
    checkState = 'checking'
    checkMsg = 'Prüfe…'
    try {
      const res = await apiFetch('/api/version')
      const v = (await res.json()) as VersionInfo
      versionShort = v.current?.gitShaShort ?? 'unbekannt'
      if (v.updateAvailable === true) {
        checkState = 'update'
        checkMsg = `Update verfügbar (${v.latest?.gitShaShort ?? 'neuer Commit'})`
      } else if (v.updateAvailable === false) {
        checkState = 'current'
        checkMsg = 'Bereits aktuell'
      } else {
        checkState = 'unknown'
        checkMsg = updateCheckReason(v.reason)
      }
    } catch {
      checkState = 'unknown'
      checkMsg = 'Prüfung nicht möglich (App nicht erreichbar)'
    }
  }

  const navLinks = [
    { href: '/',          label: 'Dashboard' },
    { href: '/inventar',  label: 'Inventar'  },
    { href: '/orte',      label: 'Räume'     },
    { href: '/einkaufsliste', label: 'Einkaufsliste' },
    { href: '/einkauf',   label: 'Einkauf'   },
    { href: '/einstellungen', label: 'Einstellungen' },
  ]

  function isActive(href: string): boolean {
    if (href === '/') return $page.url.pathname === '/'
    return $page.url.pathname === href || $page.url.pathname.startsWith(href + '/')
  }

  function toggleMenu() {
    menuOpen = !menuOpen
  }

  function closeMenu() {
    menuOpen = false
  }

  async function logout() {
    await fetch('/api/auth/sign-out', { method: 'POST' })
    await invalidateAll()
    goto('/login')
  }
</script>

{#if data.user}
  <div class="app-shell">
    <nav class="navbar">
      <div class="navbar-inner">
        <!-- Logo -->
        <a href="/" class="logo" onclick={closeMenu}>stoqr</a>

        <!-- Desktop nav links -->
        <ul class="nav-links" role="list">
          {#each navLinks as link}
            <li>
              <a
                href={link.href}
                class="nav-link"
                class:active={isActive(link.href)}
              >
                {link.label}
              </a>
            </li>
          {/each}
        </ul>

        <!-- Right side: user + theme toggle + logout -->
        <div class="nav-right">
          <span class="username">{data.user.name || data.user.email}</span>
          <button
            class="btn-theme"
            class:btn-theme--dark={darkMode}
            onclick={toggleDarkMode}
            type="button"
            title={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
            aria-label={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
          >
            {#if darkMode}
              <!-- Moon icon — shown in dark mode -->
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6.5 6.5 0 1 0 7 7z" fill="currentColor"/>
              </svg>
            {:else}
              <!-- Sun icon — shown in light mode -->
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M11.36 4.64l-1.42 1.42M4.64 11.36l-1.42 1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            {/if}
          </button>
          {#if !data.authDisabled}
            <button class="btn-logout" onclick={logout} type="button">
              Abmelden
            </button>
          {/if}
        </div>

        <!-- Hamburger (mobile only) -->
        <button
          class="hamburger"
          onclick={toggleMenu}
          aria-label="Menü öffnen"
          aria-expanded={menuOpen}
          type="button"
        >
          {#if menuOpen}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          {:else}
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          {/if}
        </button>
      </div>

      <!-- Mobile menu -->
      {#if menuOpen}
        <div class="mobile-menu" role="navigation" aria-label="Mobile Navigation">
          <ul role="list">
            {#each navLinks as link}
              <li>
                <a
                  href={link.href}
                  class="mobile-nav-link"
                  class:active={isActive(link.href)}
                  onclick={closeMenu}
                >
                  {link.label}
                </a>
              </li>
            {/each}
          </ul>
          <div class="mobile-user">
            <span class="username">{data.user.name || data.user.email}</span>
            <div class="mobile-user-actions">
              <button
                class="btn-theme"
                class:btn-theme--dark={darkMode}
                onclick={toggleDarkMode}
                type="button"
                title={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
                aria-label={darkMode ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
              >
                {#if darkMode}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6.5 6.5 0 1 0 7 7z" fill="currentColor"/>
                  </svg>
                {:else}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.22 3.22l1.42 1.42M11.36 11.36l1.42 1.42M11.36 4.64l-1.42 1.42M4.64 11.36l-1.42 1.42" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                {/if}
              </button>
              {#if !data.authDisabled}
                <button class="btn-logout" onclick={logout} type="button">
                  Abmelden
                </button>
              {/if}
            </div>
          </div>
        </div>
      {/if}
    </nav>

    <main class="main-content">
      {@render children()}

      <footer class="version-footer">
        <button
          class="version-badge version-badge--{checkState}"
          type="button"
          onclick={checkForUpdate}
          title="Auf Update prüfen"
        >
          <span class="version-dot" aria-hidden="true"></span>
          stoqr · {versionShort}{#if checkMsg} — {checkMsg}{/if}
        </button>
      </footer>
    </main>
  </div>
{:else}
  {@render children()}
{/if}

<Toast />

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background-color: var(--color-base);
  }

  .version-footer {
    display: flex;
    justify-content: center;
    padding: var(--space-6, 24px) var(--space-4, 16px) var(--space-8, 32px);
  }
  .version-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: 1px solid var(--color-border);
    background: var(--color-surface-raised, var(--color-surface));
    color: var(--color-text-muted);
    border-radius: 999px;
    padding: 5px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 120ms, color 120ms;
  }
  .version-badge:hover { border-color: var(--color-primary); color: var(--color-primary); }
  .version-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-text-muted); flex-shrink: 0; }
  .version-badge--checking .version-dot { background: #a16207; }
  .version-badge--current { color: var(--color-success, #16a34a); border-color: var(--color-success, #16a34a); }
  .version-badge--current .version-dot { background: var(--color-success, #16a34a); }
  .version-badge--update { color: var(--color-primary); border-color: var(--color-primary); }
  .version-badge--update .version-dot { background: var(--color-primary); }
  .version-badge--unknown .version-dot { background: var(--color-danger, #dc2626); }

  /* ── Navbar ─────────────────────────────────────── */

  .navbar {
    position: sticky;
    top: 0;
    z-index: var(--z-sticky);
    height: 56px;
    background-color: var(--color-surface-raised);
    border-bottom: 1px solid var(--color-border);
    box-shadow: var(--shadow-sm);
  }

  .navbar-inner {
    display: flex;
    align-items: center;
    height: 56px;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--space-6);
    gap: var(--space-6);
  }

  /* ── Logo ───────────────────────────────────────── */

  .logo {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-accent);
    text-decoration: none;
    letter-spacing: -0.02em;
    flex-shrink: 0;
    transition: color var(--transition-fast);
  }

  .logo:hover {
    color: var(--color-primary);
  }

  /* ── Desktop nav links ──────────────────────────── */

  .nav-links {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
  }

  .nav-link {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast), background-color var(--transition-fast);
    white-space: nowrap;
  }

  .nav-link:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  .nav-link.active {
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    font-weight: 600;
  }

  /* ── Right side ─────────────────────────────────── */

  .nav-right {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-shrink: 0;
    margin-left: auto;
  }

  .username {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .btn-theme {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 32px;
    width: 36px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: linear-gradient(135deg, #fff8e8 0%, #fdecc8 100%);
    color: #b45309;
    cursor: pointer;
    font-size: 1rem;
    transition: background var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base), color var(--transition-base);
  }

  .btn-theme:hover {
    border-color: #f5a623;
    background: linear-gradient(135deg, #fff3d4 0%, #fde5a8 100%);
  }

  /* Dark mode button — deep blue-purple, wins via !important */
  .btn-theme--dark {
    background: linear-gradient(135deg, #2d2060 0%, #1a1040 100%) !important;
    border-color: #7060c0 !important;
    box-shadow: 0 0 10px rgba(110, 80, 220, 0.3) !important;
    color: #c0b0ff !important;
  }

  .btn-theme--dark:hover {
    background: linear-gradient(135deg, #3d2880 0%, #221560 100%) !important;
    border-color: #8070d0 !important;
  }

  .btn-logout {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: color var(--transition-fast), border-color var(--transition-fast), background-color var(--transition-fast);
    white-space: nowrap;
  }

  .btn-logout:hover {
    color: var(--color-danger);
    border-color: var(--color-danger);
    background-color: var(--color-danger-subtle);
  }

  /* ── Hamburger ──────────────────────────────────── */

  .hamburger {
    display: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-md);
    border: none;
    background-color: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    margin-left: auto;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .hamburger:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  /* ── Mobile menu ────────────────────────────────── */

  .mobile-menu {
    background-color: var(--color-surface-raised);
    border-top: 1px solid var(--color-border-subtle);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .mobile-menu ul {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .mobile-nav-link {
    display: flex;
    align-items: center;
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast), background-color var(--transition-fast);
  }

  .mobile-nav-link:hover {
    color: var(--color-text-primary);
    background-color: var(--color-surface-sunken);
  }

  .mobile-nav-link.active {
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
    font-weight: 600;
  }

  .mobile-user {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
  }

  .mobile-user-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  /* ── Main content ───────────────────────────────── */

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* ── Responsive breakpoint ──────────────────────── */

  @media (max-width: 680px) {
    .navbar {
      height: auto;
    }

    .navbar-inner {
      height: 56px;
    }

    .nav-links,
    .nav-right {
      display: none;
    }

    .hamburger {
      display: flex;
    }
  }
</style>
