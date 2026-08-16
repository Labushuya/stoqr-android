<script lang="ts">
  interface Props {
    status: 'fresh' | 'ok' | 'soon' | 'critical' | 'expired';
    daysRemaining: number | null;
  }

  let { status, daysRemaining }: Props = $props();

  const label = $derived((): string => {
    if (daysRemaining === null) return 'Kein MHD';
    if (daysRemaining < 0) return `${Math.abs(daysRemaining)} ${Math.abs(daysRemaining) === 1 ? 'Tag' : 'Tage'} überfällig`;
    if (daysRemaining === 0) return 'Heute!';
    if (daysRemaining === 1) return 'Noch 1 Tag';
    return `Noch ${daysRemaining} Tage`;
  });
</script>

<span class="mhd-{status}">{label()}</span>
