<script lang="ts">
  import { onDestroy } from 'svelte'
  import { BrowserMultiFormatReader, NotFoundException } from '@zxing/browser'

  // ── Props ────────────────────────────────────────────────────────────────────
  let {
    onDetect,
    onClose,
    active = true,
  }: {
    onDetect: (barcode: string) => void
    onClose: () => void
    active?: boolean
  } = $props()

  // ── State ────────────────────────────────────────────────────────────────────
  let videoEl = $state<HTMLVideoElement | null>(null)
  let error = $state<string | null>(null)
  let scanning = $state(false)
  let manualCode = $state('')

  let codeReader: BrowserMultiFormatReader | null = null
  let controls: { stop: () => void } | null = null

  // ── Scanner lifecycle ────────────────────────────────────────────────────────
  $effect(() => {
    if (active && videoEl) {
      startScanner()
    }
    return () => stopScanner()
  })

  async function startScanner() {
    if (scanning) return
    error = null
    scanning = true

    try {
      codeReader = new BrowserMultiFormatReader()
      controls = await codeReader.decodeFromVideoDevice(
        undefined,
        videoEl!,
        (result, err) => {
          if (result) {
            const code = result.getText()
            stopScanner()
            onDetect(code)
          }
          if (err && !(err instanceof NotFoundException)) {
            console.warn('[BarcodeScanner]', err)
          }
        }
      )
    } catch (e: unknown) {
      scanning = false
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        error = 'Kamera-Zugriff verweigert. Bitte Berechtigung in den Browser-Einstellungen erteilen.'
      } else if (msg.includes('NotFound') || msg.includes('Requested device not found')) {
        error = 'Keine Kamera gefunden.'
      } else {
        error = `Kamera konnte nicht gestartet werden: ${msg}`
      }
    }
  }

  function stopScanner() {
    controls?.stop()
    controls = null
    codeReader = null
    scanning = false
  }

  function submitManual() {
    const code = manualCode.trim()
    if (!code) return
    stopScanner()
    onDetect(code)
  }

  onDestroy(() => stopScanner())
</script>

<div class="scanner-overlay">
  <!-- Header -->
  <div class="scanner-header">
    <span class="scanner-title">Barcode scannen</span>
    <button class="scanner-close" type="button" onclick={onClose} aria-label="Schließen">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  </div>

  {#if error}
    <!-- Error state -->
    <div class="scanner-error">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-width="2"/>
        <path d="M20 12v9M20 28v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <p>{error}</p>
    </div>
  {:else}
    <!-- Video viewfinder -->
    <div class="scanner-viewfinder">
      <!-- svelte-ignore a11y_media_has_caption -->
      <!-- svelte-ignore a11y_distracting_elements -->
      <video bind:this={videoEl} class="scanner-video" playsinline autoplay muted></video>

      <!-- Scan zone overlay -->
      <div class="scan-frame" aria-hidden="true">
        <div class="scan-corner tl"></div>
        <div class="scan-corner tr"></div>
        <div class="scan-corner bl"></div>
        <div class="scan-corner br"></div>
        {#if scanning}
          <div class="scan-line"></div>
        {/if}
      </div>
    </div>

    <p class="scanner-hint">
      {#if scanning}
        Barcode in den Rahmen halten …
      {:else}
        Kamera wird gestartet …
      {/if}
    </p>
  {/if}

  <!-- Manual fallback -->
  <div class="scanner-manual">
    <p class="manual-label">Oder Barcode manuell eingeben:</p>
    <div class="manual-row">
      <input
        class="manual-input"
        type="text"
        inputmode="numeric"
        placeholder="EAN / Barcode"
        bind:value={manualCode}
        onkeydown={(e) => e.key === 'Enter' && submitManual()}
      />
      <button class="manual-btn" type="button" onclick={submitManual} disabled={!manualCode.trim()}>
        OK
      </button>
    </div>
  </div>
</div>

<style>
  .scanner-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    background: #000;
    display: flex;
    flex-direction: column;
    color: #fff;
  }

  /* ── Header ─────────────────────────────────────────────── */
  .scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4, 16px) var(--space-4, 16px);
    background: rgba(0,0,0,.6);
    flex-shrink: 0;
  }

  .scanner-title {
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: var(--text-md, 1.125rem);
    font-weight: 600;
    color: #fff;
  }

  .scanner-close {
    background: none;
    border: none;
    color: #fff;
    cursor: pointer;
    padding: var(--space-2, 8px);
    border-radius: var(--radius-md, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: .8;
    transition: opacity var(--transition-fast, 80ms);
  }
  .scanner-close:hover { opacity: 1; }

  /* ── Viewfinder ──────────────────────────────────────────── */
  .scanner-viewfinder {
    position: relative;
    flex: 1;
    overflow: hidden;
    background: #111;
  }

  .scanner-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* Scan frame corners */
  .scan-frame {
    position: absolute;
    inset: 50%;
    transform: translate(-50%, -50%);
    width: min(280px, 75vw);
    height: min(180px, 48vw);
  }

  .scan-corner {
    position: absolute;
    width: 24px;
    height: 24px;
    border-color: var(--color-primary, #C4673A);
    border-style: solid;
  }
  .tl { top: 0; left: 0;  border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
  .tr { top: 0; right: 0; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
  .bl { bottom: 0; left: 0;  border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
  .br { bottom: 0; right: 0; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

  /* Animated scan line */
  .scan-line {
    position: absolute;
    left: 4px;
    right: 4px;
    height: 2px;
    background: var(--color-primary, #C4673A);
    box-shadow: 0 0 8px var(--color-primary, #C4673A);
    animation: scan 2s ease-in-out infinite;
  }

  @keyframes scan {
    0%   { top: 4px; }
    50%  { top: calc(100% - 6px); }
    100% { top: 4px; }
  }

  /* ── Hint ────────────────────────────────────────────────── */
  .scanner-hint {
    text-align: center;
    padding: var(--space-3, 12px) var(--space-4, 16px);
    font-size: var(--text-sm, 0.8rem);
    color: rgba(255,255,255,.7);
    flex-shrink: 0;
    background: rgba(0,0,0,.5);
    margin: 0;
  }

  /* ── Error ───────────────────────────────────────────────── */
  .scanner-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-4, 16px);
    padding: var(--space-8, 32px);
    color: var(--color-warning, #E5A020);
    text-align: center;
    font-size: var(--text-sm, 0.8rem);
  }

  /* ── Manual input ────────────────────────────────────────── */
  .scanner-manual {
    padding: var(--space-4, 16px);
    background: rgba(0,0,0,.7);
    flex-shrink: 0;
  }

  .manual-label {
    font-size: var(--text-sm, 0.8rem);
    color: rgba(255,255,255,.6);
    margin: 0 0 var(--space-2, 8px);
  }

  .manual-row {
    display: flex;
    gap: var(--space-2, 8px);
  }

  .manual-input {
    flex: 1;
    background: rgba(255,255,255,.1);
    border: 1px solid rgba(255,255,255,.2);
    border-radius: var(--radius-md, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    color: #fff;
    font-size: var(--text-base, 1rem);
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    letter-spacing: .05em;
  }
  .manual-input::placeholder { color: rgba(255,255,255,.35); }
  .manual-input:focus {
    outline: none;
    border-color: var(--color-primary, #C4673A);
  }

  .manual-btn {
    background: var(--color-primary, #C4673A);
    color: #fff;
    border: none;
    border-radius: var(--radius-md, 8px);
    padding: var(--space-2, 8px) var(--space-5, 20px);
    font-size: var(--text-base, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast, 80ms);
  }
  .manual-btn:hover:not(:disabled) { background: var(--color-primary-hover, #A8542E); }
  .manual-btn:disabled { opacity: .4; cursor: not-allowed; }
</style>
