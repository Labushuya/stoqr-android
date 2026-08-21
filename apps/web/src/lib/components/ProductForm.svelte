<script lang="ts">
  import { toast } from '$lib/stores/toast'
  import { buildCategoryTree } from '$lib/utils/category-tree'
  import { apiFetch } from '$lib/client/api'

  // ---------------------------------------------------------------------------
  // ProductForm — EINE vollstaendige Artikel-Stammdaten-Bearbeitung (G11).
  //
  // Deckt name, brand, gtin (EAN), categoryId, imageUrl, defaultUnit, description
  // ab und wird ueberall identisch verwendet (Einstellungen>Artikel, Inventar-
  // Detailseite, Inventar-Anlegen). Modus:
  //  - product == null → Anlegen (POST /api/products)
  //  - product gesetzt → Bearbeiten (PATCH /api/products/[id])
  // onSaved(product) liefert das gespeicherte/angelegte Produkt zurueck.
  // ---------------------------------------------------------------------------

  type Category = { id: string; name: string; parentId?: string | null; icon?: string | null; sortOrder?: number }
  type UnitOption = { symbol: string; name: string; dimension?: string | null }
  type ProductInput = {
    id: string
    name: string
    brand: string | null
    gtin: string | null
    categoryId: string | null
    imageUrl: string | null
    defaultUnit: string
    description: string | null
    hasDeposit?: boolean
    depositCt?: number | null
  }

  let {
    open,
    product = null,
    categories,
    units,
    showUnit = true,
    fieldSources = {},
    onSaved,
    onClose,
    onReset,
  }: {
    open: boolean
    product?: ProductInput | null
    categories: Category[]
    units: UnitOption[]
    // Auf der Detailseite fuehrt der eigene defaultUnit-Editor → Feld hier ausblenden.
    showUnit?: boolean
    // Feld-Herkunft (G32) — nur fuer den "Herkunft zuruecksetzen"-Button relevant.
    fieldSources?: Partial<Record<'name' | 'brand' | 'image' | 'category' | 'unit', 'off' | 'globus' | 'manual'>>
    onSaved: (product: Record<string, unknown>) => void
    onClose: () => void
    // Callback nach erfolgreichem Herkunft-Reset (G35) — Aufrufer kann seinen
    // lokalen fieldSources-State aktualisieren, damit er nicht stale bleibt.
    onReset?: (field: 'name' | 'brand' | 'image' | 'category' | 'unit') => void
  } = $props()

  const isEdit = $derived(product != null)
  // Kategorie-Herkunfts-Schutz: NICHT das Prop spiegeln (fieldSources kommt bei
  // manchen Aufrufern lazy per fetch NACH dem Oeffnen — ein einmaliger $effect-Seed
  // wuerde die spaetere Aenderung verpassen, G33). Stattdessen im Markup direkt
  // reaktiv aufs Prop pruefen; dieses Flag blendet den Button nur nach dem Reset aus.
  let catSourceReset = $state(false)
  let catSourceResetting = $state(false)
  // Non-Breaking-Spaces fuer sichtbare <option>-Einrueckung (normale Spaces
  // kollabiert HTML in <option>) — G27-2.
  const catIndent = (depth: number) => (depth > 0 ? String.fromCharCode(160).repeat(depth * 4) : '')
  // Kategorien als Baum (eingerueckte Optionen, G27). parentId/sortOrder sind optional
  // im Prop-Typ → defensiv normalisieren.
  const categoryTree = $derived(
    buildCategoryTree(
      categories.map((c) => ({
        id: c.id, name: c.name, icon: c.icon ?? null,
        parentId: c.parentId ?? null, sortOrder: c.sortOrder ?? 0,
      }))
    )
  )

  // Draft-Felder, aus product geseedet (bzw. leer beim Anlegen).
  let fName = $state('')
  let fBrand = $state('')
  let fGtin = $state('')
  let fCategoryId = $state('')
  let fImageUrl = $state('')
  let fUnit = $state('piece')
  let fDescription = $state('')
  // Pfand (G47): Checkbox + Betrag in Cent.
  let fHasDeposit = $state(false)
  let fDepositCt = $state<number | null>(null)
  // Pfand nur bei count-Einheiten (G49): dimension der gewaehlten Standard-Einheit.
  // Fehlt die Dimension in den Optionen (z.B. Detailseite ohne showUnit), Fallback
  // ueber das Symbol: unbekannt gilt als count. Editiert wird die Einheit hier nur
  // wenn showUnit; sonst zaehlt product.defaultUnit.
  const fUnitIsCount = $derived.by(() => {
    const sym = showUnit ? fUnit : (product?.defaultUnit ?? fUnit)
    const dim = units.find((u) => u.symbol === sym)?.dimension
    return (dim ?? 'count') === 'count'
  })
  let saving = $state(false)
  let error = $state<string | null>(null)

  // Bei jedem Oeffnen (oder Wechsel des product) neu seeden.
  let seededFor = $state<string | null>(null)
  $effect(() => {
    if (!open) { seededFor = null; return }
    const key = product?.id ?? '__new__'
    if (seededFor === key) return
    seededFor = key
    fName = product?.name ?? ''
    fBrand = product?.brand ?? ''
    fGtin = product?.gtin ?? ''
    fCategoryId = product?.categoryId ?? ''
    fImageUrl = product?.imageUrl ?? ''
    fUnit = product?.defaultUnit ?? 'piece'
    fDescription = product?.description ?? ''
    // Pfand aus dem product-Prop reseeden (nicht aus $derived).
    fHasDeposit = product?.hasDeposit ?? false
    fDepositCt = product?.depositCt ?? null
    catSourceReset = false
    error = null
  })

  async function resetCategorySource() {
    if (!product?.id) return
    catSourceResetting = true
    try {
      const res = await apiFetch(`/api/products/${product.id}/sources?field=category`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        toast.error(`Fehler ${res.status}`)
        return
      }
      catSourceReset = true // Button sofort ausblenden
      onReset?.('category')
      toast.success('Herkunft zurückgesetzt. Die Kategorie wird beim nächsten Katalog-Abgleich (Artikel-Sicherung → Übernehmen) neu per Regel zugeordnet.')
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      catSourceResetting = false
    }
  }

  async function save() {
    const name = fName.trim()
    if (!name) { error = 'Name ist erforderlich.'; return }
    saving = true
    error = null
    const payload: Record<string, unknown> = {
      name,
      brand: fBrand.trim() || null,
      gtin: fGtin.trim() || null,
      categoryId: fCategoryId || null,
      imageUrl: fImageUrl.trim() || null,
      description: fDescription.trim() || null,
      hasDeposit: fUnitIsCount && fHasDeposit,
      depositCt: fUnitIsCount && fHasDeposit ? fDepositCt : null,
    }
    if (showUnit) payload.defaultUnit = fUnit
    try {
      const url = isEdit ? `/api/products/${product!.id}` : '/api/products'
      const method = isEdit ? 'PATCH' : 'POST'
      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { error = String(body?.error ?? `Fehler ${res.status}`); return }
      toast.success(isEdit ? 'Artikel gespeichert' : 'Artikel angelegt')
      onSaved(body)
    } catch {
      error = 'Netzwerkfehler.'
    } finally {
      saving = false
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  // Backdrop-Close nur, wenn Klick auf dem Backdrop begann UND endete — sonst
  // schliesst Text-Markieren (Maus zieht raus) faelschlich (G16-3).
  let downOnBackdrop = false
  function onBackdropPointerDown(e: PointerEvent) {
    downOnBackdrop = e.target === e.currentTarget
  }
  function onBackdropClick(e: MouseEvent) {
    const onBackdrop = downOnBackdrop && e.target === e.currentTarget
    downOnBackdrop = false
    if (onBackdrop) onClose()
  }
</script>

{#if open}
  <div class="pf-backdrop" role="presentation" onpointerdown={onBackdropPointerDown} onclick={onBackdropClick}>
    <div
      class="pf-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={isEdit ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}
      onkeydown={onKeydown}
    >
      <h2 class="pf-title">{isEdit ? 'Artikel bearbeiten' : 'Neuen Artikel anlegen'}</h2>

      {#if error}
        <p class="pf-error" role="alert">{error}</p>
      {/if}

      <div class="pf-grid">
        <label class="pf-field pf-field--full">
          <span class="pf-label">Name *</span>
          <input class="input" type="text" bind:value={fName} maxlength="255" placeholder="z.B. Vollmilch" />
        </label>

        <label class="pf-field">
          <span class="pf-label">Marke</span>
          <input class="input" type="text" bind:value={fBrand} maxlength="128" placeholder="optional" />
        </label>

        <label class="pf-field">
          <span class="pf-label">EAN / Barcode</span>
          <input class="input" type="text" inputmode="numeric" bind:value={fGtin} maxlength="14" placeholder="optional" />
        </label>

        <label class="pf-field">
          <span class="pf-label">Kategorie {#if isEdit && fieldSources.category === 'manual' && !catSourceReset}<button class="pf-reset-src" type="button" disabled={catSourceResetting} title="Setzt die manuelle Herkunft zurück — die Kategorie bleibt, wird aber wieder für Zuordnungs-Regeln empfänglich." onclick={resetCategorySource}>Herkunft zurücksetzen</button>{/if}</span>
          <select class="input" bind:value={fCategoryId}>
            <option value="">— keine —</option>
            {#each categoryTree as cat (cat.id)}
              <option value={cat.id}>{catIndent(cat.depth)}{cat.name}</option>
            {/each}
          </select>
        </label>

        {#if showUnit}
          <label class="pf-field">
            <span class="pf-label">Standard-Einheit</span>
            <select class="input" bind:value={fUnit}>
              {#each units as u (u.symbol)}
                <option value={u.symbol}>{u.name}</option>
              {/each}
            </select>
          </label>
        {/if}

        <label class="pf-field pf-field--full">
          <span class="pf-label">Bild-URL</span>
          <input class="input" type="text" bind:value={fImageUrl} placeholder="/media/… oder https://…" />
        </label>

        {#if fImageUrl.trim()}
          <div class="pf-field pf-field--full pf-preview">
            <img src={fImageUrl.trim()} alt="Vorschau" class="pf-preview-img" />
          </div>
        {/if}

        <label class="pf-field pf-field--full">
          <span class="pf-label">Beschreibung</span>
          <textarea class="input pf-textarea" bind:value={fDescription} rows="2" placeholder="optional"></textarea>
        </label>

        <!-- Pfand (G47/G49) — nur fuer count-Einheiten (Flasche/Dose/Stück) -->
        <div class="pf-field pf-field--full">
          <label class="pf-check" class:pf-check--disabled={!fUnitIsCount}>
            <input class="checkbox" type="checkbox" bind:checked={fHasDeposit} disabled={!fUnitIsCount} />
            <span class="pf-label">Pfand</span>
          </label>
          {#if !fUnitIsCount}
            <p class="pf-hint">Pfand nur für Stück-Einheiten (z.&nbsp;B. Flasche, Dose).</p>
          {:else if fHasDeposit}
            <div class="pf-deposit">
              {#each [8, 15, 16, 25] as ct (ct)}
                <button
                  type="button"
                  class="chip"
                  class:chip--on={fDepositCt === ct}
                  onclick={() => (fDepositCt = ct)}
                >{(ct / 100).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €</button>
              {/each}
              <input
                class="input pf-deposit-free"
                type="number" min="0" step="0.01" placeholder="andere (€)"
                value={fDepositCt != null ? fDepositCt / 100 : ''}
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value
                  fDepositCt = v === '' ? null : Math.round(Number(v.replace(',', '.')) * 100)
                }}
              />
            </div>
          {/if}
        </div>
      </div>

      <div class="pf-actions">
        <button class="btn-ghost" type="button" onclick={onClose} disabled={saving}>Abbrechen</button>
        <button class="btn-primary" type="button" onclick={save} disabled={saving}>
          {#if saving}<span class="spinner" aria-hidden="true"></span>{/if}
          {isEdit ? 'Speichern' : 'Anlegen'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .pf-backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4);
  }
  .pf-modal {
    background: var(--color-surface-raised, var(--color-surface));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl, 16px);
    padding: var(--space-6);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: var(--shadow-lg, 0 10px 40px rgba(0, 0, 0, 0.2));
  }
  .pf-title {
    font-family: var(--font-display, inherit);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-4);
  }
  .pf-error {
    background: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: var(--radius-md);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    margin: 0 0 var(--space-3);
  }
  .pf-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .pf-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1 1 200px;
  }
  .pf-field--full { flex-basis: 100%; }
  /* Pfand (G47) */
  .pf-check { display: inline-flex; align-items: center; gap: var(--space-2); cursor: pointer; }
  .pf-check--disabled { opacity: 0.55; cursor: not-allowed; }
  .pf-hint { font-size: var(--text-xs); color: var(--color-text-muted); margin: var(--space-1) 0 0; }
  .pf-deposit { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); margin-top: var(--space-2); }
  /* .chip/.chip--on: Optik global */
  .pf-deposit-free { max-width: 140px; }
  .pf-label {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  .pf-reset-src {
    margin-left: var(--space-2);
    padding: 0 6px;
    height: 18px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: transparent;
    color: var(--color-primary);
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }
  .pf-reset-src:hover:not(:disabled) { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .pf-reset-src:disabled { opacity: 0.5; cursor: not-allowed; }
  /* .input: Optik global; hier nur Textarea-Layout */
  .pf-textarea { height: auto; padding: var(--space-2) var(--space-3); resize: vertical; }
  .pf-preview { align-items: flex-start; }
  .pf-preview-img {
    max-height: 80px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    object-fit: contain;
    background: var(--color-surface-sunken);
  }
  .pf-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
  /* .btn-ghost/.btn-primary/.spinner: Optik global */
</style>
