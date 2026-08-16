<script lang="ts">
  // ---------------------------------------------------------------------------
  // Datentransfer (Import/Export) — Erstbefuellung Pi <-> App
  // ---------------------------------------------------------------------------
  // Export: Umfang graduell waehlbar (minimal -> maximal). App schreibt+teilt die
  // .stoqr-Datei via Capacitor (transfer.app.ts); Pi bietet einen Download-Link.
  // Import: Datei waehlen -> type-to-confirm (REPLACE ist destruktiv) -> anwenden.
  // Zeigt Insert-Summary + Warnungen (unbekannte Referenzen etc.).
  //
  // TIER_META/ExportTier stammen aus dem puren Transfer-Kern. Bewusst ueber den
  // dedizierten Subpath '@stoqr/db/transfer' (nur drizzle-orm/getTableColumns) —
  // NICHT ueber '@stoqr/db' oder '/sqlite': beide re-exportieren seeds/categories
  // -> src/client -> postgres und wuerden den Pi-Client-Bundle brechen.
  import { TIER_META, type ExportTier } from '@stoqr/db/transfer'
  import { apiFetch } from '$lib/client/api'

  // ── Export-State ──────────────────────────────────────────────────────────
  let scope = $state<ExportTier>('alles')
  let exporting = $state(false)
  let exportMsg = $state<string | null>(null)
  let exportErr = $state<string | null>(null)

  async function doExport() {
    exporting = true
    exportMsg = null
    exportErr = null
    try {
      if (__STOQR_TARGET__ === 'app') {
        // App: native Datei schreiben + Teilen-Dialog. Ein abgebrochenes Teilen
        // ist KEIN Fehler — die Datei ist bereits geschrieben (transfer.app.ts
        // liefert shared:false zurueck statt zu werfen).
        const { exportToFile } = await import('$lib/client/transfer.app')
        const res = await exportToFile(scope)
        exportMsg = res.shared
          ? `Export erstellt und geteilt: ${res.filename}`
          : `Export gespeichert: ${res.filename}`
      } else {
        // Pi: Browser-Download ueber den GET-Endpoint.
        const res = await apiFetch(`/api/transfer/export?scope=${encodeURIComponent(scope)}`)
        if (!res.ok) {
          const b = await res.json().catch(() => ({}))
          throw new Error(b?.error ?? `Export fehlgeschlagen (${res.status})`)
        }
        const text = await res.text()
        const stamp = new Date().toISOString().slice(0, 10)
        const filename = `stoqr-${scope}-${stamp}.stoqr`
        const blob = new Blob([text], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        exportMsg = `Download gestartet: ${filename}`
      }
    } catch (err) {
      exportErr = err instanceof Error ? err.message : String(err)
    } finally {
      exporting = false
    }
  }

  // ── Import-State ──────────────────────────────────────────────────────────
  const CONFIRM_PHRASE = 'stoqr ueberschreiben'
  let fileText = $state<string | null>(null)
  let fileName = $state<string | null>(null)
  let confirmInput = $state('')
  let importing = $state(false)
  let importErr = $state<string | null>(null)
  let importResult = $state<{
    scope: string
    sourceSystem: string
    inserted: Record<string, number>
    reusedProducts: number
    warnings: string[]
  } | null>(null)

  const confirmOk = $derived(confirmInput.trim() === CONFIRM_PHRASE)

  async function onFileChange(e: Event) {
    importErr = null
    importResult = null
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) {
      fileText = null
      fileName = null
      return
    }
    try {
      const text = await file.text()
      if (!text.trim().length) {
        throw new Error('Die Datei ist leer.')
      }
      // Fruehe Plausibilitaetspruefung, damit der Nutzer eine falsche Datei sofort
      // erkennt (statt erst nach dem Tippen der Bestaetigungsphrase).
      try {
        const parsed = JSON.parse(text)
        if (parsed?.formatVersion == null || parsed?.tables == null) {
          throw new Error('missing fields')
        }
      } catch {
        throw new Error('Das ist keine gueltige .stoqr-Datei (JSON-Envelope erwartet).')
      }
      fileText = text
      fileName = file.name
    } catch (err) {
      importErr = err instanceof Error ? err.message : String(err)
      fileText = null
      fileName = null
    }
  }

  async function doImport() {
    if (!fileText || !confirmOk) return
    importing = true
    importErr = null
    importResult = null
    try {
      let result
      if (__STOQR_TARGET__ === 'app') {
        const { importFromText } = await import('$lib/client/transfer.app')
        result = await importFromText(fileText)
      } else {
        const res = await apiFetch('/api/transfer/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ confirm: true, file: fileText }),
        })
        const b = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(b?.error ?? `Import fehlgeschlagen (${res.status})`)
        result = b
      }
      importResult = result
      // Nach dem REPLACE Eingabe zuruecksetzen.
      confirmInput = ''
      fileText = null
      fileName = null
    } catch (err) {
      importErr = err instanceof Error ? err.message : String(err)
    } finally {
      importing = false
    }
  }

  const insertedEntries = $derived(
    importResult ? Object.entries(importResult.inserted).filter(([, n]) => n > 0) : []
  )
</script>

<svelte:head><title>Datentransfer · stoqr</title></svelte:head>

<div class="page">
  <header class="page-header">
    <a href="/einstellungen" class="back-link">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span>Einstellungen</span>
    </a>
    <h1 class="page-title">Import / Export</h1>
    <p class="page-lead">
      Sichere deine Daten als Datei und uebertrage sie zwischen Pi und App. Dies dient der
      Erstbefuellung — der laufende Abgleich (Sync) kommt spaeter.
    </p>
  </header>

  <!-- ── Export ─────────────────────────────────────────────────────────── -->
  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Exportieren</h2>
      <span class="section-desc">Waehle den Umfang — von minimal (nur Stammdaten) bis maximal (alles).</span>
    </div>
    <div class="section-body">
      <div class="tiers">
        {#each TIER_META as tier}
          <label class="tier" class:tier--selected={scope === tier.id}>
            <input type="radio" name="scope" value={tier.id} bind:group={scope} />
            <span class="tier-body">
              <span class="tier-title">{tier.title}</span>
              <span class="tier-desc">{tier.desc}</span>
            </span>
          </label>
        {/each}
      </div>

      <button class="btn-primary" onclick={doExport} disabled={exporting}>
        {exporting ? 'Exportiere…' : 'Exportieren'}
      </button>

      {#if exportMsg}<p class="note note--ok">{exportMsg}</p>{/if}
      {#if exportErr}<p class="note note--err">{exportErr}</p>{/if}
    </div>
  </section>

  <!-- ── Import ─────────────────────────────────────────────────────────── -->
  <section class="settings-section settings-section--danger">
    <div class="section-header">
      <h2 class="section-title">Importieren</h2>
      <span class="section-desc">
        Der Import <strong>ersetzt</strong> deinen Bestand, deine Orte und Listen. Artikel werden
        global per Barcode (GTIN) zusammengefuehrt; Kategorien und Naehrwert-Typen bleiben erhalten.
        Am besten vorher exportieren.
      </span>
    </div>
    <div class="section-body">
      <label class="file-field">
        <span class="file-label">.stoqr-Datei waehlen</span>
        <input type="file" accept=".stoqr,application/json,application/octet-stream,text/plain,*/*" onchange={onFileChange} />
      </label>
      {#if fileName}<p class="note">Gewaehlt: <strong>{fileName}</strong></p>{/if}

      {#if fileText}
        <div class="confirm">
          <label class="reset-label" for="confirm-input">
            Zum Bestaetigen tippe: <code class="reset-phrase">{CONFIRM_PHRASE}</code>
          </label>
          <input
            id="confirm-input"
            class="reset-input"
            type="text"
            bind:value={confirmInput}
            placeholder={CONFIRM_PHRASE}
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
          />
        </div>
        <button class="btn-danger" onclick={doImport} disabled={!confirmOk || importing}>
          {importing ? 'Importiere…' : 'Daten ersetzen und importieren'}
        </button>
      {/if}

      {#if importErr}<p class="note note--err">{importErr}</p>{/if}

      {#if importResult}
        <div class="result">
          <p class="note note--ok">
            Import abgeschlossen — Quelle: {importResult.sourceSystem}, Umfang: {importResult.scope}.
          </p>
          {#if insertedEntries.length}
            <ul class="counts">
              {#each insertedEntries as [table, n]}
                <li><strong>{n}</strong> × {table}</li>
              {/each}
            </ul>
          {:else}
            <p class="note">Keine neuen Datensaetze eingefuegt.</p>
          {/if}
          {#if importResult.reusedProducts > 0}
            <p class="note">{importResult.reusedProducts} Artikel per Barcode wiederverwendet (nicht dupliziert).</p>
          {/if}
          {#if importResult.warnings.length}
            <details class="warnings">
              <summary>{importResult.warnings.length} Hinweis(e)</summary>
              <ul>
                {#each importResult.warnings as w}<li>{w}</li>{/each}
              </ul>
            </details>
          {/if}
        </div>
      {/if}
    </div>
  </section>

  <!-- ── Sync (in Vorbereitung) ─────────────────────────────────────────── -->
  <section class="settings-section settings-section--disabled">
    <div class="section-header">
      <h2 class="section-title">
        Laufender Abgleich
        <span class="badge">In Vorbereitung</span>
      </h2>
      <span class="section-desc">
        Automatischer, bidirektionaler Sync zwischen Pi und App. Bis dahin dienen Import/Export der
        einmaligen Erstbefuellung.
      </span>
    </div>
  </section>
</div>

<style>
  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

  .page-header {
    margin-bottom: var(--space-8);
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
    text-decoration: none;
    font-size: var(--text-sm);
    margin-bottom: var(--space-2);
  }
  .back-link:hover {
    color: var(--color-text-primary);
  }
  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0 0 var(--space-2);
  }
  .page-lead {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Section (Design-Sprache aus einstellungen/+page.svelte) ─────────────── */
  .settings-section {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
    box-shadow: var(--shadow-sm);
  }
  .settings-section--disabled {
    opacity: 0.6;
  }
  .settings-section--danger {
    border-color: color-mix(in srgb, var(--color-danger) 40%, var(--color-border));
  }
  .section-header {
    margin-bottom: var(--space-6);
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
    flex-wrap: wrap;
  }
  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }
  .badge {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    background: var(--color-surface-sunken);
    border-radius: var(--radius-sm);
    padding: 2px 8px;
  }

  /* ── Export-Tiers ───────────────────────────────────────────────────────── */
  .tiers {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  .tier {
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-3) var(--space-4);
    cursor: pointer;
    transition: border-color var(--transition-fast), background-color var(--transition-fast);
  }
  .tier:hover {
    border-color: var(--color-primary);
  }
  .tier--selected {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }
  .tier input {
    margin-top: 3px;
    accent-color: var(--color-primary);
    flex-shrink: 0;
  }
  .tier-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .tier-title {
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .tier-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  /* ── Buttons (Spiegel von einstellungen) ────────────────────────────────── */
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
  .btn-danger {
    display: inline-flex;
    align-items: center;
    height: 40px;
    padding: 0 var(--space-5);
    border: 1px solid var(--color-danger);
    background: var(--color-danger);
    color: #fff;
    border-radius: var(--radius-md);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    margin-top: var(--space-4);
    transition: opacity var(--transition-fast);
  }
  .btn-danger:hover:not(:disabled) {
    opacity: 0.9;
  }
  .btn-danger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Import: Datei + Bestaetigung ───────────────────────────────────────── */
  .file-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .file-label {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .file-field input[type='file'] {
    font-size: var(--text-sm);
    color: var(--color-text-primary);
  }
  .confirm {
    margin-top: var(--space-5);
  }
  .reset-label {
    display: block;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .reset-phrase {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-sunken);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: var(--color-danger);
    user-select: all;
  }
  .reset-input {
    width: 100%;
  }

  /* ── Meldungen / Ergebnis ───────────────────────────────────────────────── */
  .note {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }
  .note--ok {
    color: var(--color-success);
  }
  .note--err {
    color: var(--color-danger);
  }
  .result {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
  }
  .counts {
    columns: 2;
    font-size: var(--text-sm);
    color: var(--color-text-primary);
    margin: var(--space-2) 0;
    padding-left: var(--space-5);
  }
  .warnings {
    margin-top: var(--space-2);
  }
  .warnings summary {
    cursor: pointer;
    color: var(--color-text-muted);
    font-size: var(--text-sm);
  }
  .warnings ul {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: var(--space-2) 0 0;
    padding-left: var(--space-5);
  }
</style>
