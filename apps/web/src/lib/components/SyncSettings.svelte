<script lang="ts">
  // ---------------------------------------------------------------------------
  // Sync-Einstellungen (Phase-1-Stub)
  // ---------------------------------------------------------------------------
  // Waehlbares fuehrendes System (App | Pi) + optionale Pi-URL. In Phase 1 wird
  // die Auswahl NUR gespeichert und hat noch keine Wirkung (kein Netzcode). Ist
  // keine Pi-URL gepflegt, gilt die App als Standalone und damit selbst als
  // fuehrendes System.
  //
  // Persistenz laeuft ueber apiFetch('/api/settings/sync'):
  //   App-Target  -> App-Router schreibt in die lokale `meta`-Tabelle (SQLite).
  //   Pi-Target   -> Endpoint liefert einen statischen Phase-1-Default (Pi=Leader),
  //                  Speichern ist dort ein No-op (der Pi kennt keine App-Sync-Config).
  import { onMount } from 'svelte'
  import { apiFetch } from '$lib/client/api'
  import { toast } from '$lib/stores/toast'

  type Leader = 'app' | 'pi'

  let leader = $state<Leader>('app')
  let piUrl = $state('')
  let loaded = $state(false)
  let saving = $state(false)

  // Ist keine Pi-URL gepflegt, ist "Pi als Leader" wirkungslos -> App bleibt
  // effektiv Standalone. Wir zeigen das als Hinweis, blockieren aber nicht.
  const effectiveStandalone = $derived(leader === 'app' || piUrl.trim() === '')

  onMount(async () => {
    try {
      const res = await apiFetch('/api/settings/sync')
      if (res.ok) {
        const b = await res.json().catch(() => ({}))
        if (b?.leader === 'app' || b?.leader === 'pi') leader = b.leader
        if (typeof b?.piUrl === 'string') piUrl = b.piUrl
      }
    } catch {
      // Offline/kein Endpoint -> Defaults (App als Leader) behalten.
    } finally {
      loaded = true
    }
  })

  async function save() {
    saving = true
    try {
      const res = await apiFetch('/api/settings/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leader, piUrl: piUrl.trim() }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        toast.error(String(b?.error ?? `Fehler ${res.status}`))
        return
      }
      toast.success('Sync-Einstellungen gespeichert.')
    } catch {
      toast.error('Speichern fehlgeschlagen.')
    } finally {
      saving = false
    }
  }
</script>

<section class="settings-section">
  <div class="section-header">
    <h2 class="section-title">
      <span class="section-icon" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M4 6.5A5 5 0 0113.5 5M14 11.5A5 5 0 014.5 13" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M13.5 3v2.5H11M4.5 15v-2.5H7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
      Sync
      <span class="coming-soon-badge">In Vorbereitung</span>
    </h2>
    <p class="section-desc">
      Waehle das fuehrende System fuer den spaeteren bidirektionalen Abgleich mit der
      Pi-Instanz. Diese App ist voll eigenstaendig nutzbar. Der Sync selbst folgt in
      einer spaeteren Version &mdash; die Auswahl wird hier bereits gespeichert.
    </p>
  </div>

  {#if loaded}
    <fieldset class="sync-fieldset">
      <legend class="sync-legend">Fuehrendes System</legend>
      <label class="sync-radio" class:sync-radio--active={leader === 'app'}>
        <input type="radio" name="leader" value="app" bind:group={leader} />
        <span class="sync-radio-text">
          <span class="sync-radio-title">Diese App (Standalone)</span>
          <span class="sync-radio-desc">Standard. Die App ist die maßgebliche Quelle.</span>
        </span>
      </label>
      <label class="sync-radio" class:sync-radio--active={leader === 'pi'}>
        <input type="radio" name="leader" value="pi" bind:group={leader} />
        <span class="sync-radio-text">
          <span class="sync-radio-title">Pi-Instanz</span>
          <span class="sync-radio-desc">Die Pi-Version ist maßgeblich; die App gleicht sich an.</span>
        </span>
      </label>
    </fieldset>

    <div class="field sync-url-field">
      <label class="label" for="sync-pi-url">Pi-URL (optional)</label>
      <input
        id="sync-pi-url"
        class="input"
        type="url"
        inputmode="url"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="https://stoqr.fam.ily"
        bind:value={piUrl}
      />
      <p class="field-hint">
        {#if effectiveStandalone}
          Ohne gepflegte Pi-URL laeuft die App standalone und ist selbst das fuehrende System.
        {:else}
          Adresse der Pi-Instanz fuer den spaeteren Abgleich. Noch ohne Wirkung.
        {/if}
      </p>
    </div>

    <div class="form-footer">
      <button class="btn-primary" type="button" disabled={saving} onclick={save}>
        {#if saving}<span class="spinner" aria-hidden="true"></span> Speichern…{:else}Speichern{/if}
      </button>
    </div>
  {:else}
    <p class="field-hint">Lade Einstellungen…</p>
  {/if}
</section>

<style>
  .sync-fieldset {
    border: none;
    padding: 0;
    margin: 0 0 var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sync-legend {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    padding: 0;
    margin-bottom: var(--space-1);
  }
  .sync-radio {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .sync-radio--active {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }
  .sync-radio input {
    margin-top: 3px;
    accent-color: var(--color-primary);
    flex-shrink: 0;
  }
  .sync-radio-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .sync-radio-title {
    font-weight: 600;
    color: var(--color-text-primary);
    font-size: var(--text-sm);
  }
  .sync-radio-desc {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }
  .sync-url-field {
    margin-bottom: var(--space-5);
  }
</style>
