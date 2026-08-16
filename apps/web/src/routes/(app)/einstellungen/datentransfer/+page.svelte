<script lang="ts">
  // ---------------------------------------------------------------------------
  // Datentransfer (Import/Export) — Erstbefuellung Pi <-> App
  // ---------------------------------------------------------------------------
  // Export: Umfang graduell waehlbar (minimal -> maximal). App schreibt+teilt die
  // .stoqr-Datei via Capacitor (transfer.app.ts); Pi bietet einen Download-Link.
  // Import: Datei waehlen -> type-to-confirm (REPLACE ist destruktiv) -> anwenden.
  // Zeigt Insert-Summary + Warnungen (unbekannte Referenzen etc.).
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
        // App: native Datei schreiben + Teilen-Dialog.
        const { exportToFile } = await import('$lib/client/transfer.app')
        const res = await exportToFile(scope)
        exportMsg = `Export erstellt: ${res.filename} (geteilt)`
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
      fileText = await file.text()
      fileName = file.name
    } catch (err) {
      importErr = `Datei konnte nicht gelesen werden: ${err instanceof Error ? err.message : String(err)}`
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
  <header class="page-head">
    <a href="/einstellungen" class="back">← Einstellungen</a>
    <h1>Import / Export</h1>
    <p class="lead">
      Sichere deine Daten als Datei und uebertrage sie zwischen Pi und App. Dies dient der
      <strong>Erstbefuellung</strong> — der laufende Abgleich (Sync) kommt spaeter.
    </p>
  </header>

  <!-- ── Export ─────────────────────────────────────────────────────────── -->
  <section class="card">
    <h2>Exportieren</h2>
    <p class="hint">Waehle den Umfang. Von minimal (nur Stammdaten) bis maximal (alles).</p>

    <div class="tiers">
      {#each TIER_META as tier}
        <label class="tier" class:selected={scope === tier.id}>
          <input type="radio" name="scope" value={tier.id} bind:group={scope} />
          <div class="tier-body">
            <span class="tier-title">{tier.title}</span>
            <span class="tier-desc">{tier.desc}</span>
          </div>
        </label>
      {/each}
    </div>

    <button class="btn primary" onclick={doExport} disabled={exporting}>
      {exporting ? 'Exportiere…' : 'Exportieren'}
    </button>

    {#if exportMsg}<p class="ok">{exportMsg}</p>{/if}
    {#if exportErr}<p class="err">{exportErr}</p>{/if}
  </section>

  <!-- ── Import ─────────────────────────────────────────────────────────── -->
  <section class="card danger">
    <h2>Importieren (ersetzt lokale Daten)</h2>
    <p class="hint">
      Der Import <strong>ersetzt</strong> deinen Bestand, deine Orte, Listen usw. Artikel werden
      global per Barcode (GTIN) zusammengefuehrt. <strong>Vorher exportieren</strong> wird empfohlen.
      Kategorien und Naehrwert-Typen bleiben erhalten.
    </p>

    <input type="file" accept=".stoqr,application/json" onchange={onFileChange} />
    {#if fileName}<p class="hint">Gewaehlt: <strong>{fileName}</strong></p>{/if}

    {#if fileText}
      <label class="confirm">
        <span>Zum Bestaetigen tippe: <code>{CONFIRM_PHRASE}</code></span>
        <input type="text" bind:value={confirmInput} placeholder={CONFIRM_PHRASE} autocomplete="off" />
      </label>
      <button class="btn danger-btn" onclick={doImport} disabled={!confirmOk || importing}>
        {importing ? 'Importiere…' : 'Daten ersetzen und importieren'}
      </button>
    {/if}

    {#if importErr}<p class="err">{importErr}</p>{/if}

    {#if importResult}
      <div class="result">
        <p class="ok">
          Import abgeschlossen (Quelle: {importResult.sourceSystem}, Umfang: {importResult.scope}).
        </p>
        {#if insertedEntries.length}
          <ul class="counts">
            {#each insertedEntries as [table, n]}
              <li><strong>{n}</strong> × {table}</li>
            {/each}
          </ul>
        {/if}
        {#if importResult.reusedProducts > 0}
          <p class="hint">{importResult.reusedProducts} Artikel per Barcode wiederverwendet (nicht dupliziert).</p>
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
  </section>
</div>

<style>
  .page { max-width: 640px; margin: 0 auto; padding: 1rem 1rem 4rem; }
  .page-head { margin-bottom: 1.5rem; }
  .back { color: var(--color-muted, #6b7280); text-decoration: none; font-size: 0.9rem; }
  h1 { margin: 0.5rem 0 0.25rem; font-size: 1.5rem; }
  .lead { color: var(--color-muted, #6b7280); margin: 0; }
  .card {
    background: var(--color-surface, #fff);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 12px;
    padding: 1.25rem;
    margin-bottom: 1.25rem;
  }
  .card.danger { border-color: #e7c3b8; }
  h2 { margin: 0 0 0.5rem; font-size: 1.15rem; }
  .hint { color: var(--color-muted, #6b7280); font-size: 0.9rem; margin: 0.25rem 0 0.75rem; }
  .tiers { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
  .tier {
    display: flex; gap: 0.65rem; align-items: flex-start;
    border: 1px solid var(--color-border, #e5e7eb); border-radius: 10px;
    padding: 0.75rem; cursor: pointer;
  }
  .tier.selected { border-color: var(--color-accent, #c4673a); background: #faf3ef; }
  .tier input { margin-top: 0.2rem; }
  .tier-body { display: flex; flex-direction: column; gap: 0.15rem; }
  .tier-title { font-weight: 600; }
  .tier-desc { color: var(--color-muted, #6b7280); font-size: 0.85rem; }
  .btn {
    border: none; border-radius: 10px; padding: 0.65rem 1.1rem;
    font-size: 0.95rem; font-weight: 600; cursor: pointer;
  }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.primary { background: var(--color-accent, #c4673a); color: #fff; }
  .danger-btn { background: #b3452a; color: #fff; margin-top: 0.5rem; }
  .confirm { display: flex; flex-direction: column; gap: 0.35rem; margin: 0.85rem 0; font-size: 0.9rem; }
  .confirm code { background: #f3f4f6; padding: 0.1rem 0.35rem; border-radius: 5px; }
  .confirm input {
    border: 1px solid var(--color-border, #e5e7eb); border-radius: 8px; padding: 0.5rem;
    font-size: 0.95rem;
  }
  .ok { color: #2f7a4d; font-size: 0.9rem; }
  .err { color: #b3452a; font-size: 0.9rem; }
  .result { margin-top: 0.85rem; }
  .counts { columns: 2; font-size: 0.88rem; color: #374151; margin: 0.5rem 0; }
  .warnings summary { cursor: pointer; color: #8a5a2b; font-size: 0.9rem; }
  .warnings ul { font-size: 0.85rem; color: #6b7280; }
</style>
