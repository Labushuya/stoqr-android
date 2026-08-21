<script lang="ts">
  import { apiFetch } from '$lib/client/api';
  interface Props {
    onDetect: (date: string) => void;
    onClose: () => void;
  }

  let { onDetect, onClose }: Props = $props();

  type Phase = 'camera' | 'loading' | 'preview' | 'error';

  let phase = $state<Phase>('camera');
  let videoEl = $state<HTMLVideoElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let detectedLabel = $state<string>('');
  let detectedIso = $state<string>('');
  let errorMsg = $state<string>('');

  // Start camera on mount
  $effect(() => {
    startCamera();
    return () => stopCamera();
  });

  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      if (videoEl) {
        videoEl.srcObject = stream;
      }
    } catch {
      phase = 'error';
      errorMsg = 'Kamera konnte nicht geöffnet werden.';
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  async function captureAndScan() {
    if (!videoEl || !canvasEl) return;

    const video = videoEl;
    const canvas = canvasEl;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    phase = 'loading';

    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('Canvas empty')), 'image/jpeg', 0.92);
      });

      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');

      const res = await apiFetch('/api/ocr/mhd', { method: 'POST', body: formData });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json() as { date?: string; label?: string };

      if (!data.date) {
        phase = 'error';
        errorMsg = 'Kein Datum erkannt — bitte manuell eingeben.';
        return;
      }

      detectedIso = data.date;
      // Use provided label or format from ISO
      detectedLabel = data.label ?? formatIsoToDisplay(data.date);
      phase = 'preview';
    } catch {
      phase = 'error';
      errorMsg = 'Kein Datum erkannt — bitte manuell eingeben.';
    }
  }

  function formatIsoToDisplay(iso: string): string {
    // YYYY-MM-DD → DD.MM.YYYY
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    return `${d}.${m}.${y}`;
  }

  function handleConfirm() {
    stopCamera();
    onDetect(detectedIso);
  }

  function handleRetry() {
    detectedLabel = '';
    detectedIso = '';
    errorMsg = '';
    phase = 'camera';
    // Re-bind stream to video since we may have paused
    if (videoEl && stream) {
      videoEl.srcObject = stream;
    }
  }

  function handleClose() {
    stopCamera();
    onClose();
  }
</script>

<!-- Backdrop -->
<div class="scanner-backdrop" role="dialog" aria-modal="true" aria-label="MHD scannen">
  <div class="scanner-sheet">

    <!-- Header -->
    <div class="scanner-header">
      <span class="scanner-title">MHD scannen</span>
      <button class="btn-icon" onclick={handleClose} aria-label="Schließen">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <!-- Video viewport -->
    <div class="video-wrapper">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        bind:this={videoEl}
        class="video-feed"
        autoplay
        playsinline
        muted
        aria-hidden="true"
      ></video>

      <!-- Scan overlay frame -->
      {#if phase === 'camera'}
        <div class="scan-frame" aria-hidden="true"></div>
        <span class="scan-hint">Datum im Rahmen positionieren</span>
      {/if}

      <!-- Loading overlay -->
      {#if phase === 'loading'}
        <div class="overlay overlay--loading" aria-label="Wird verarbeitet">
          <span class="spinner" aria-hidden="true"></span>
          <span class="overlay-text">Datum wird erkannt…</span>
        </div>
      {/if}

      <!-- Preview overlay -->
      {#if phase === 'preview'}
        <div class="overlay overlay--preview">
          <div class="preview-card">
            <span class="preview-label">Erkannt:</span>
            <span class="preview-date">{detectedLabel}</span>
          </div>
        </div>
      {/if}

      <!-- Error overlay -->
      {#if phase === 'error'}
        <div class="overlay overlay--error">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.75"/>
            <path d="M12 7v5M12 16.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <span class="overlay-text">{errorMsg}</span>
        </div>
      {/if}
    </div>

    <!-- Hidden canvas for capture -->
    <canvas bind:this={canvasEl} class="capture-canvas" aria-hidden="true"></canvas>

    <!-- Actions -->
    <div class="scanner-actions">
      {#if phase === 'camera'}
        <button class="btn-primary btn-block" onclick={captureAndScan}>
          Scannen
        </button>

      {:else if phase === 'loading'}
        <button class="btn-primary btn-block" disabled>
          <span class="spinner spinner--sm" aria-hidden="true"></span>
          Wird verarbeitet…
        </button>

      {:else if phase === 'preview'}
        <button class="btn-ghost" onclick={handleRetry}>
          Erneut versuchen
        </button>
        <button class="btn-primary" onclick={handleConfirm}>
          Bestätigen
        </button>

      {:else if phase === 'error'}
        <button class="btn-ghost btn-block" onclick={handleRetry}>
          Erneut versuchen
        </button>
      {/if}
    </div>

  </div>
</div>

<style>
  /* ── Backdrop ── */
  .scanner-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    background: rgba(28, 20, 12, 0.72);
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding: 0;
    backdrop-filter: blur(2px);
    -webkit-backdrop-filter: blur(2px);
  }

  /* ── Sheet (bottom drawer on mobile) ── */
  .scanner-sheet {
    width: 100%;
    max-width: 480px;
    background: var(--color-surface-raised);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    box-shadow: var(--shadow-xl);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: slide-up 240ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes slide-up {
    from { transform: translateY(100%); opacity: 0; }
    to   { transform: translateY(0);   opacity: 1; }
  }

  /* ── Header ── */
  .scanner-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  .scanner-title {
    font-family: var(--font-display);
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .btn-icon {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    cursor: pointer;
    color: var(--color-text-muted);
    transition: background var(--transition-fast), color var(--transition-fast);
    padding: 0;
  }

  .btn-icon:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  /* ── Video ── */
  .video-wrapper {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: #000;
    overflow: hidden;
  }

  .video-feed {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Scan guide frame ── */
  .scan-frame {
    position: absolute;
    inset: 20% 12%;
    border: 2px solid var(--color-primary);
    border-radius: var(--radius-md);
    box-shadow:
      0 0 0 9999px rgba(0, 0, 0, 0.40),
      inset 0 0 0 1px rgba(255, 255, 255, 0.08);
    pointer-events: none;
  }

  /* Corner accents */
  .scan-frame::before,
  .scan-frame::after {
    content: '';
    position: absolute;
    width: 18px;
    height: 18px;
    border-color: var(--color-primary);
    border-style: solid;
  }

  .scan-frame::before {
    top: -2px;
    left: -2px;
    border-width: 3px 0 0 3px;
    border-radius: var(--radius-sm) 0 0 0;
  }

  .scan-frame::after {
    bottom: -2px;
    right: -2px;
    border-width: 0 3px 3px 0;
    border-radius: 0 0 var(--radius-sm) 0;
  }

  .scan-hint {
    position: absolute;
    bottom: var(--space-4);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(28, 20, 12, 0.65);
    color: #fff;
    font-size: var(--text-xs);
    font-family: var(--font-body);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-full);
    white-space: nowrap;
    pointer-events: none;
    backdrop-filter: blur(4px);
  }

  /* ── Overlays ── */
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    padding: var(--space-6);
  }

  .overlay--loading {
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
  }

  .overlay--preview {
    background: rgba(0, 0, 0, 0.50);
  }

  .overlay--error {
    background: rgba(0, 0, 0, 0.60);
    color: var(--color-danger);
  }

  .overlay-text {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    text-align: center;
    color: inherit;
  }

  /* ── Preview card ── */
  .preview-card {
    background: var(--color-surface-raised);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
    box-shadow: var(--shadow-lg);
  }

  .preview-label {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-text-muted);
  }

  .preview-date {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    line-height: 1.1;
  }

  /* ── Spinner ── */
  .spinner {
    display: inline-block;
    width: 2rem;
    height: 2rem;
    border: 2.5px solid rgba(255, 255, 255, 0.25);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 700ms linear infinite;
    flex-shrink: 0;
  }

  .spinner--sm {
    width: 1rem;
    height: 1rem;
    border-width: 2px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Hidden canvas ── */
  .capture-canvas {
    display: none;
  }

  /* ── Actions bar ── */
  .scanner-actions {
    display: flex;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5);
    padding-bottom: max(var(--space-5), env(safe-area-inset-bottom));
    border-top: 1px solid var(--color-border-subtle);
    flex-shrink: 0;
  }

  /* ── Buttons: Optik global; hier nur Zeilen-Layout ── */
  /* Buttons teilen sich die Aktionszeile gleichmaessig (frueher .btn{flex:1}). */
  .scanner-actions > button { flex: 1; }
  .scanner-actions > button.btn-block { flex: 1 1 100%; width: 100%; }

  /* ── Desktop: center as modal ── */
  @media (min-width: 600px) {
    .scanner-backdrop {
      align-items: center;
    }

    .scanner-sheet {
      border-radius: var(--radius-xl);
      max-height: 90vh;
    }
  }
</style>
