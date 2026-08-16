<script lang="ts">
  import Modal from './Modal.svelte'

  let {
    open = false,
    title,
    message,
    confirmLabel = 'Bestätigen',
    cancelLabel = 'Abbrechen',
    destructive = false,
    onConfirm,
    onCancel,
  }: {
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
    onConfirm: () => void
    onCancel: () => void
  } = $props()
</script>

<Modal {open} {title} size="sm" onClose={onCancel}>
  <p class="modal-message">{message}</p>
  {#snippet footer()}
    <button class="btn-cancel" type="button" onclick={onCancel}>
      {cancelLabel}
    </button>
    <button
      class="btn-confirm"
      class:btn-confirm--destructive={destructive}
      type="button"
      onclick={onConfirm}
    >
      {confirmLabel}
    </button>
  {/snippet}
</Modal>

<style>
  .modal-message {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
    margin: 0;
    white-space: pre-line;
  }

  .btn-cancel {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast), color var(--transition-fast);
  }

  .btn-cancel:hover {
    background: var(--color-surface-sunken);
    color: var(--color-text-primary);
  }

  .btn-confirm {
    height: 36px;
    padding: 0 var(--space-4);
    border-radius: var(--radius-md);
    border: none;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .btn-confirm:hover {
    background: var(--color-primary-hover);
  }

  .btn-confirm--destructive {
    background: var(--color-danger);
  }

  .btn-confirm--destructive:hover {
    background: #901c12;
  }
</style>
