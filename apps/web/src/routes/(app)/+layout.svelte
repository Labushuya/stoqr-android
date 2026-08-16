<script lang="ts">
  let { children } = $props()
</script>

<div class="app-shell">
  {@render children()}
</div>

<style>
  .app-shell {
    padding: var(--space-6);
  }

  /* Mobile: reduziertes Shell-Padding, damit es sich nicht mit dem
     Page-Padding jeder Seite zu breiten Rändern addiert. */
  @media (max-width: 560px) {
    .app-shell {
      padding: var(--space-2);
    }
  }
</style>
