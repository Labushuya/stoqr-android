<script lang="ts">
  // ---------------------------------------------------------------------------
  // DepositBadge — kleines Pfand-Pill (G48/G49/G50). EINE einheitliche Darstellung
  // fuer Pfand an allen Stellen. Eigene, neutrale Farbe (Blau) — bewusst NICHT orange
  // (=Angebot/reserviert) oder gruen (=guenstigster). Pfand ist an count-Einheiten
  // gebunden (Flasche/Dose/Stück).
  //
  //  depositCt > 0     → „Pfand 0,25 €" (Blau)
  //  depositCt == null → „Pfand — Betrag?" (Amber, gestrichelt) — Betrag fehlt noch,
  //                      z.B. weil der Katalog-Abruf nur Pfand ja/nein liefert (G47/G49);
  //                      der Betrag muss manuell gepflegt werden (G50).
  // ---------------------------------------------------------------------------

  let { depositCt = null }: { depositCt?: number | null } = $props()

  const hasAmount = $derived(depositCt != null && depositCt > 0)
  const label = $derived(
    hasAmount
      ? `Pfand ${((depositCt as number) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €`
      : 'Pfand — Betrag?'
  )
</script>

<span
  class="deposit-badge"
  class:deposit-badge--missing={!hasAmount}
  title={hasAmount ? 'Pfand (Leergut)' : 'Pfandbetrag fehlt — bitte am Artikel nachpflegen'}
>{label}</span>

<style>
  .deposit-badge {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 999px;
    /* Eigene Pfand-Farbe (Blau) — abgesetzt von orange/gruen. */
    background: #e0edff;
    color: #1d4ed8;
    vertical-align: middle;
    line-height: 1.4;
    white-space: nowrap;
  }
  /* Betrag fehlt (G50): Amber, gestrichelt — analog zum „Kein MHD"-Hinweis, aber
     eigene Farbe (nicht MHD-orange, nicht Fehler-rot). Signalisiert „nachpflegen". */
  .deposit-badge--missing {
    background: #fef9c3;
    color: #a16207;
    border: 1px dashed #d4a017;
    padding: 0 5px;
  }
</style>
