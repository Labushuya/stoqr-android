<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    open = false,
    title,
    onClose,
    size = 'md',
    closeOnBackdrop = true,
    children,
    footer,
  }: {
    open: boolean
    title: string
    onClose: () => void
    size?: 'sm' | 'md' | 'lg'
    closeOnBackdrop?: boolean
    children: Snippet
    footer?: Snippet
  } = $props()

  // Backdrop-Close nur, wenn der Klick WIRKLICH auf dem Backdrop begann UND endete
  // (e.target === Backdrop bei pointerdown UND click). Verhindert das faelschliche
  // Schliessen, wenn man im Modal Text markiert und die Maus dabei nach aussen zieht.
  let downOnBackdrop = false
  function onBackdropPointerDown(e: PointerEvent) {
    downOnBackdrop = e.target === e.currentTarget
  }
  function onBackdropClick(e: MouseEvent) {
    const onBackdrop = downOnBackdrop && e.target === e.currentTarget
    downOnBackdrop = false
    if (closeOnBackdrop && onBackdrop) onClose()
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="modal-backdrop"
    onpointerdown={onBackdropPointerDown}
    onclick={onBackdropClick}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
    role="presentation"
  >
    <div
      class="modal modal--{size}"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
    >
      <div class="modal-header">
        <h2 id="modal-title" class="modal-title">{title}</h2>
        <button class="modal-close" type="button" aria-label="Schließen" onclick={onClose}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="modal-body">
        {@render children()}
      </div>
      {#if footer}
        <div class="modal-footer">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 400);
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }

  .modal {
    background: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-xl);
    width: 100%;
    display: flex;
    flex-direction: column;
    max-height: min(90dvh, 760px);
    overflow: hidden;
    animation: modal-in 160ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  .modal--sm { max-width: 420px; }
  .modal--md { max-width: 520px; }
  .modal--lg { max-width: 640px; }

  @keyframes modal-in {
    from { opacity: 0; transform: scale(0.95) translateY(8px); }
    to   { opacity: 1; transform: scale(1)    translateY(0);   }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-6) var(--space-3);
    flex-shrink: 0;
  }

  .modal-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }

  .modal-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
    transition: background var(--transition-fast), color var(--transition-fast);
  }
  .modal-close:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .modal-body {
    padding: 0 var(--space-6) var(--space-5);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6);
    border-top: 1px solid var(--color-border-subtle);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  @media (max-width: 480px) {
    .modal-backdrop { padding: var(--space-2); align-items: flex-end; }
    .modal { max-height: 92dvh; }
  }
</style>
