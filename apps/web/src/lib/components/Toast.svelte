<script lang="ts">
  import { toast } from '$lib/stores/toast'
</script>

{#if $toast.length > 0}
  <div class="toast-stack" role="region" aria-label="Notifications" aria-live="polite">
    {#each $toast as t (t.id)}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="toast toast--{t.type}"
        role="alert"
        onclick={() => toast.dismiss(t.id)}
        onkeydown={(e) => e.key === 'Enter' || e.key === ' ' ? toast.dismiss(t.id) : null}
        tabindex="0"
      >
        <span class="toast__icon">
          {#if t.type === 'success'}✓{:else if t.type === 'error'}✕{:else}i{/if}
        </span>
        <span class="toast__message">{t.message}</span>
        <button class="toast__close" onclick={() => toast.dismiss(t.id)} aria-label="Dismiss">×</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-stack {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    pointer-events: none;
    max-width: min(24rem, calc(100vw - 3rem));
  }

  .toast {
    pointer-events: all;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    border: 1px solid transparent;
    font-family: var(--font-body, 'Inter', sans-serif);
    font-size: 0.875rem;
    font-weight: 500;
    line-height: 1.4;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(44, 31, 20, 0.15);

    /* slide-in from the right */
    animation: toast-slide-in 200ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }

  @keyframes toast-slide-in {
    from {
      opacity: 0;
      transform: translateX(1.5rem);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  .toast--success {
    background-color: var(--color-success-subtle, #E4EFDF);
    border-color: var(--color-success, #7A9E7E);
    color: var(--color-text-primary, #2C1F14);
  }

  .toast--success .toast__icon {
    color: var(--color-success, #7A9E7E);
  }

  .toast--error {
    background-color: var(--color-danger-subtle, #F5E0DE);
    border-color: var(--color-danger, #B03A2E);
    color: var(--color-text-primary, #2C1F14);
  }

  .toast--error .toast__icon {
    color: var(--color-danger, #B03A2E);
  }

  .toast--info {
    background-color: var(--color-surface-raised, #FAF7F2);
    border-color: var(--color-border, #D4C8B0);
    color: var(--color-text-primary, #2C1F14);
  }

  .toast--info .toast__icon {
    color: var(--color-text-muted, #9C876E);
  }

  .toast__icon {
    flex-shrink: 0;
    width: 1.125rem;
    height: 1.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    line-height: 1;
  }

  .toast__message {
    flex: 1;
    min-width: 0;
  }

  .toast__close {
    flex-shrink: 0;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
    margin-left: 0.25rem;
    font-size: 1.125rem;
    line-height: 1;
    color: var(--color-text-muted, #9C876E);
    opacity: 0.6;
    transition: opacity 120ms ease;
  }

  .toast__close:hover {
    opacity: 1;
  }
</style>
