<script lang="ts">
  interface Props {
    label: string;
    value: number | string;
    color: string;
    icon?: string;
    href?: string;
  }

  let { label, value, color, icon, href }: Props = $props();
</script>

{#if href}
  <a {href} class="stat-card" style="--accent: var({color})">
    {#if icon}<span class="stat-icon" aria-hidden="true">{icon}</span>{/if}
    <span class="stat-value">{value}</span>
    <span class="stat-label">{label}</span>
  </a>
{:else}
  <div class="stat-card" style="--accent: var({color})">
    {#if icon}<span class="stat-icon" aria-hidden="true">{icon}</span>{/if}
    <span class="stat-value">{value}</span>
    <span class="stat-label">{label}</span>
  </div>
{/if}

<style>
  .stat-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-4) var(--space-5);
    background-color: var(--color-surface-raised);
    border-radius: var(--radius-lg);
    border-left: 4px solid var(--accent);
    box-shadow: var(--shadow-sm);
    text-decoration: none;
    color: inherit;
    transition:
      box-shadow var(--transition-base),
      transform var(--transition-base);
  }

  a.stat-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .stat-icon {
    font-size: var(--text-lg);
    line-height: 1;
    margin-bottom: var(--space-1);
  }

  .stat-value {
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: 700;
    line-height: 1;
    color: var(--color-text-primary);
  }

  .stat-label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    letter-spacing: 0.01em;
  }
</style>
