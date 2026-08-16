<script lang="ts">
  // ---------------------------------------------------------------------------
  // SourceBadge — kleines Herkunfts-Pill fuer ein Feld (G15/G16).
  // Zeigt, woher der aktuelle Wert stammt: OpenFoodFacts / Markt-Katalog / manuell.
  // Fehlt die Quelle (Altartikel ohne erfasste Herkunft), wird ein neutrales
  // '?'-Pill mit Tooltip angezeigt (G16 — Badge IMMER sichtbar).
  // ---------------------------------------------------------------------------

  let { source }: { source: 'off' | 'globus' | 'manual' | null | undefined } = $props()

  const key = $derived(source ?? 'unknown')
  const LABEL = { off: 'OFF', globus: 'Globus', manual: 'manuell', unknown: '?' } as const
  const TITLE = {
    off: 'Quelle: OpenFoodFacts',
    globus: 'Quelle: Globus-Katalog',
    manual: 'Manuell gepflegt',
    unknown: 'Herkunft nicht erfasst',
  } as const
</script>

<span class="source-badge source-badge--{key}" title={TITLE[key]}>{LABEL[key]}</span>

<style>
  .source-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--color-surface-sunken);
    color: var(--color-text-muted);
    vertical-align: middle;
    line-height: 1.4;
  }
  .source-badge--off {
    background: var(--color-primary-subtle);
    color: var(--color-primary);
  }
  .source-badge--globus {
    background: color-mix(in srgb, var(--color-success, #16a34a) 16%, transparent);
    color: var(--color-success, #16a34a);
  }
  /* manuell + unknown = neutraler Default */
</style>
