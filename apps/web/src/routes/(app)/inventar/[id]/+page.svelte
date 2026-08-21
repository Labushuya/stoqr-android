<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation'
  import { apiFetch } from '$lib/client/api'
  import { onMount } from 'svelte'
  import ConfirmModal from '$lib/components/ConfirmModal.svelte'
  import Modal from '$lib/components/Modal.svelte'
  import ProductForm from '$lib/components/ProductForm.svelte'
  import SourceBadge from '$lib/components/SourceBadge.svelte'
  import DepositBadge from '$lib/components/DepositBadge.svelte'
  import type { PageData } from './$types'
  import { formatDate, formatStockTotal } from '$lib/utils/format'
  import { getExpiryStatus, getDaysRemaining, getExpiryLabel, EXPIRY_CLASS } from '$lib/utils/expiry'
  import { buildUnitMetaMap, pickPackDisplayUnit, packToDisplay, isCountUnit, type UnitRow } from '$lib/utils/stock'
  import { rankCheapestStore } from '$lib/utils/price-compare'
  import { formatRelativeDays } from '$lib/utils/relative-time'

  // ── Props ─────────────────────────────────────────────────────────────────

  let { data }: { data: PageData } = $props()

  // ── Types ─────────────────────────────────────────────────────────────────

  type NutrientType = { id: string; slug: string; name: string; unit: string; parentId: string | null; sortOrder: number }
  type Unit = { id: string; name: string; symbol: string; dimension?: string | null }
  type LocSegment = { id: string; name: string; kind: 'location' | 'storage' | 'place' }
  type Sibling = {
    id: string
    quantity: string
    unit: string
    bestBeforeDate: string | null
    status: string
    consumedAt: string | null
    notes: string | null
    placeId: string | null
    storeId: string | null
    purchasePriceCt: number | null
    store: { id: string; name: string; chain: string | null } | null
    locationPath: LocSegment[]
  }
  type NutrientEditRow = { nutrientTypeId: string; valuePer100: string; source: string }

  // ── Static data ─────────────────────────────────────────────────────────

  const product = $derived(data.product)
  // Feld-Herkunft (OFF/Globus/manuell) je Stammdaten-Feld (G15).
  const fieldSources = $derived(
    (data.fieldSources ?? {}) as Partial<Record<'name' | 'brand' | 'image' | 'category' | 'unit', 'off' | 'globus' | 'manual'>>
  )
  // Nutrient types are a $state (not $derived) so custom types added at runtime
  // become immediately selectable.
  // svelte-ignore state_referenced_locally
  let nutrientTypes = $state<NutrientType[]>(data.nutrientTypes as NutrientType[])
  const units = $derived(data.units as Unit[])
  // Meta-Map (dimension + toBaseFactor) fuer Gebinde-Umrechnung/-Anzeige (G7).
  const unitMeta = $derived(buildUnitMetaMap(data.units as UnitRow[]))
  // Waehlbare mass/volume-Einheiten fuer das Gebinde-Feld.
  const packUnitOptions = $derived(
    (data.units as UnitRow[]).filter((u) => u.dimension === 'mass' || u.dimension === 'volume')
  )
  const availableStores = $derived(
    data.availableStores as { id: string; name: string; chain: string | null }[]
  )
  const categories = $derived((data.categories as { id: string; name: string }[]) ?? [])

  // Stammdaten-Bearbeitung (gemeinsame ProductForm, G11).
  let editProductOpen = $state(false)
  async function onProductSaved() {
    editProductOpen = false
    await invalidateAll()
  }

  function unitLabel(symbol: string): string {
    return units.find((u) => u.symbol === symbol)?.name ?? symbol
  }
  function nutrientName(id: string): string {
    return nutrientTypes.find((t) => t.id === id)?.name ?? '?'
  }
  function nutrientUnit(id: string): string {
    return nutrientTypes.find((t) => t.id === id)?.unit ?? ''
  }

  // ── Toast ─────────────────────────────────────────────────────────────────

  type Toast = { id: number; message: string; type: 'success' | 'error' }
  let toasts = $state<Toast[]>([])
  let toastCounter = 0
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    const id = ++toastCounter
    toasts = [...toasts, { id, message, type }]
    setTimeout(() => { toasts = toasts.filter((t) => t.id !== id) }, 3500)
  }

  // ── Confirm modal ──────────────────────────────────────────────────────────

  let confirmModal = $state<{ open: boolean; title: string; message: string; confirmLabel: string; onConfirm: () => void } | null>(null)
  function showConfirm(title: string, message: string, onConfirm: () => void, confirmLabel = 'Entfernen') {
    confirmModal = { open: true, title, message, confirmLabel, onConfirm }
  }
  function closeConfirm() { confirmModal = null }

  // ── Soll-/Mindestbestand (Inkrement 2b) ─────────────────────────────────────

  type TargetRow = { targetQuantity: string; unit: string; minQuantity: string | null } | null
  type TargetStatusData = {
    status: 'ok' | 'below_target' | 'below_min' | 'not_comparable'
    targetInBase: number
    currentInBase: number
    minInBase: number | null
    unit: string
    dimension: 'mass' | 'volume' | 'count'
  } | null

  const stockTarget = $derived(data.stockTarget as TargetRow)
  const targetStatus = $derived(data.targetStatus as TargetStatusData)

  let showTargetModal = $state(false)
  let targetQtyInput = $state('')
  let targetMinInput = $state('')
  let targetSaving = $state(false)
  let targetError = $state<string | null>(null)
  // Einheit des Soll-Bestands wird NICHT mehr im Dialog gewaehlt (G22-2). Sie kommt
  // aus dem bestehenden Soll (unveraendert), sonst aus der Artikel-Standard-Einheit.
  // compareToTarget/PUT-Endpoint brauchen weiterhin eine Einheit — daher hier abgeleitet.
  const targetEffectiveUnit = $derived(stockTarget?.unit ?? product.defaultUnit ?? 'piece')

  const TARGET_LABEL: Record<string, string> = {
    ok: 'Bestand ausreichend',
    below_target: 'Unter Soll — nachkaufen',
    below_min: 'Unter Mindestbestand!',
    not_comparable: 'Nicht vergleichbar (andere Einheit)',
  }

  function openTargetModal() {
    if (stockTarget) {
      targetQtyInput = stockTarget.targetQuantity
      targetMinInput = stockTarget.minQuantity ?? ''
    } else {
      targetQtyInput = ''
      targetMinInput = ''
    }
    targetError = null
    showTargetModal = true
  }

  async function saveTarget() {
    const qty = Number(targetQtyInput)
    if (!Number.isFinite(qty) || qty <= 0) { targetError = 'Soll-Menge muss > 0 sein.'; return }
    targetSaving = true
    targetError = null
    try {
      const res = await apiFetch(`/api/products/${product.id}/target`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetQuantity: qty,
          unit: targetEffectiveUnit,
          minQuantity: String(targetMinInput ?? '').trim() || undefined,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        targetError = String(body?.error ?? `Fehler ${res.status}`)
        return
      }
      // Reload für frischen Soll-Ist-Vergleich (serverseitig berechnet).
      // stockTarget/targetStatus sind $derived(data.…) und folgen automatisch.
      showTargetModal = false
      await invalidateAll()
      showToast('Soll-Bestand gespeichert')
    } catch (err) {
      console.error('[saveTarget]', err)
      targetError = 'Netzwerkfehler.'
    } finally {
      targetSaving = false
    }
  }

  async function deleteTarget() {
    const res = await apiFetch(`/api/products/${product.id}/target`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Entfernen', 'error'); return }
    showTargetModal = false
    await invalidateAll()
    showToast('Soll-Bestand entfernt')
  }

  // ── Bestandskorrektur / Inventur (2c) ───────────────────────────────────────

  type StockGroupView = { dimension: string; displayValue: number; displayUnit: string; displayName: string }

  let showInventoryModal = $state(false)
  let invUnit = $state('')
  let invValue = $state('')
  let invSaving = $state(false)
  let invError = $state<string | null>(null)

  // Zwei-Schritt-Korrektur (G42): 1 = Zielmenge, 2 = editierbare Vorschau.
  let invStep = $state<1 | 2>(1)
  let invDirection = $state<'increase' | 'decrease'>('decrease')
  // Editierbare Vorschau-Zeilen (alt->neu). Bei „decrease": FIFO-reduzierte Zeilen.
  // Bei „increase" + Modus „bestehende": alle relevanten Zeilen zum Erhöhen.
  type PreviewLine = { id: string; oldQuantity: number; newQuantity: number; unit: string; bestBeforeDate: string | null }
  let invLines = $state<PreviewLine[]>([])
  // Nur bei „increase": Wahl bestehende erhöhen ODER neue Zeile.
  let invUpMode = $state<'existing' | 'new'>('existing')
  let invNewQty = $state('')
  let invNewMhd = $state('')

  function openInventoryModal() {
    const groups = data.stockTotals.groups as StockGroupView[]
    if (groups.length > 0) {
      invUnit = groups[0].displayUnit
      invValue = String(groups[0].displayValue)
    } else {
      invUnit = product.defaultUnit ?? 'piece'
      invValue = '0'
    }
    invError = null
    invStep = 1
    invLines = []
    invUpMode = 'existing'
    invNewQty = ''
    invNewMhd = ''
    showInventoryModal = true
  }

  // Wenn eine andere Gruppe im Select gewählt wird, den Ist-Wert dieser Gruppe vorbelegen.
  function onInvUnitChange() {
    const g = (data.stockTotals.groups as StockGroupView[]).find((x) => x.displayUnit === invUnit)
    if (g) invValue = String(g.displayValue)
  }

  // Schritt 1 → Vorschau holen (Dry-Run, schreibt nichts).
  async function loadInventoryPreview() {
    const qty = Number(invValue)
    if (!Number.isFinite(qty) || qty < 0) { invError = 'Bitte gültige Menge >= 0 angeben.'; return }
    invSaving = true
    invError = null
    try {
      const res = await apiFetch(`/api/products/${product.id}/inventory-adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newQuantity: qty, unit: invUnit, preview: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { invError = String(body?.error ?? `Fehler ${res.status}`); return }

      invDirection = body.direction
      if (body.direction === 'decrease') {
        // Alle relevanten Zeilen zeigen (nicht nur die FIFO-reduzierten), jede editierbar.
        // FIFO-Vorschlag einmischen: newQuantity aus updates, sonst = oldQuantity (unberührt).
        const proposed = new Map<string, number>(
          ((body.updates as PreviewLine[]) ?? []).map((u) => [u.id, Number(u.newQuantity)])
        )
        invLines = ((body.relevantRows as PreviewLine[]) ?? []).map((r) => ({
          ...r,
          newQuantity: proposed.has(r.id) ? (proposed.get(r.id) as number) : r.oldQuantity,
        }))
        if (invLines.length === 0) { invError = 'Keine passenden Bestände zum Reduzieren.'; return }
      } else {
        // increase: bestehende Zeilen zum Erhöhen + Vorschlag für neue Zeile.
        invLines = (body.relevantRows as PreviewLine[]) ?? []
        invUpMode = invLines.length > 0 ? 'existing' : 'new'
        invNewQty = String(body.suggestedNewQuantity ?? '')
        invNewMhd = ''
      }
      invStep = 2
    } catch {
      invError = 'Netzwerkfehler.'
    } finally {
      invSaving = false
    }
  }

  // Live-Summe der Vorschau (in der gewählten Einheit) — nur informativ.
  const invPreviewTotal = $derived(() => {
    if (invDirection === 'decrease') return invLines.reduce((s, l) => s + (Number(l.newQuantity) || 0), 0)
    if (invUpMode === 'existing') return invLines.reduce((s, l) => s + (Number(l.newQuantity) || 0), 0)
    // new: bestehende Ist-Summe + neue Zeile
    return invLines.reduce((s, l) => s + (Number(l.oldQuantity) || 0), 0) + (Number(invNewQty) || 0)
  })

  // Schritt 2 → committen (die editierten Zeilen bzw. neue Zeile).
  async function saveInventory() {
    invSaving = true
    invError = null
    try {
      const payload: {
        unit: string
        lines: Array<{ id: string; newQuantity: number }>
        newLine?: { quantity: number; bestBeforeDate?: string | null }
      } = { unit: invUnit, lines: [] }

      if (invDirection === 'decrease') {
        payload.lines = invLines.map((l) => ({ id: l.id, newQuantity: Number(l.newQuantity) || 0 }))
      } else if (invUpMode === 'existing') {
        payload.lines = invLines.map((l) => ({ id: l.id, newQuantity: Number(l.newQuantity) || 0 }))
      } else {
        const q = Number(invNewQty)
        if (!Number.isFinite(q) || q <= 0) { invError = 'Bitte eine gültige Menge für die neue Zeile angeben.'; invSaving = false; return }
        payload.newLine = { quantity: q, bestBeforeDate: invNewMhd || null }
      }

      const res = await apiFetch(`/api/products/${product.id}/inventory-adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { invError = String(body?.error ?? `Fehler ${res.status}`); return }
      showInventoryModal = false
      await invalidateAll()
      // Reseed der Bestandsliste aus frischem data (sonst haengen die Zeilen im
      // veralteten $state — Refresh-Bug G42-#3, Muster wie runNormalize).
      siblings = data.siblings as Sibling[]
      showToast('Bestand korrigiert')
    } catch {
      invError = 'Netzwerkfehler.'
    } finally {
      invSaving = false
    }
  }

  // ── Markt-Zuordnung (M:N, Planung — M1) ─────────────────────────────────────

  type StoreOpt = { id: string; name: string; chain: string | null; scrapeUrl?: string | null }

  // svelte-ignore state_referenced_locally
  let productStoreIds = $state<string[]>([...(data.productStoreIds as string[])])
  let storeSaving = $state(false)

  function isStoreLinked(id: string): boolean {
    return productStoreIds.includes(id)
  }

  async function toggleStore(id: string) {
    const next = productStoreIds.includes(id)
      ? productStoreIds.filter((s) => s !== id)
      : [...productStoreIds, id]
    // optimistisch
    const prev = productStoreIds
    productStoreIds = next
    storeSaving = true
    try {
      const res = await apiFetch(`/api/products/${product.id}/stores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeIds: next }),
      })
      if (!res.ok) {
        productStoreIds = prev
        showToast('Fehler beim Speichern der Markt-Zuordnung', 'error')
      }
    } catch {
      productStoreIds = prev
      showToast('Netzwerkfehler.', 'error')
    } finally {
      storeSaving = false
    }
  }

  // ── Preise je Markt (Block F) ─────────────────────────────────────────────
  type CurrentPrice = {
    id: string
    storeId: string
    priceCt: number
    unit: string
    isReduced: boolean
    basePriceCt: number | null
    basePriceUnit: string | null
    priceIncludesDeposit: boolean
    store: { id: string; name: string; chain: string | null } | null
  }
  const currentPrices = $derived((data.currentPrices as CurrentPrice[]) ?? [])
  function priceForStore(storeId: string): CurrentPrice | undefined {
    return currentPrices.find((p) => p.storeId === storeId)
  }
  // Günstigster-Markt-Ranking (G46): pro Basiseinheit, Grundpreis bevorzugt.
  const priceRanking = $derived(
    rankCheapestStore(
      currentPrices.map((p) => ({
        storeId: p.storeId,
        priceCt: p.priceCt,
        unit: p.unit,
        basePriceCt: p.basePriceCt,
        basePriceUnit: p.basePriceUnit,
      })),
      product,
      unitMeta,
    ),
  )
  function fmtPrice(cents: number): string {
    return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  }
  // Grundpreis-Anzeige (G44): „0,19 €/l" — der gesetzlich ausgezeichnete Preis je Basiseinheit.
  function fmtBasePrice(cents: number | null, unit: string | null): string {
    if (cents == null || !unit) return ''
    return `${fmtPrice(cents)}/${unit}`
  }

  let priceEditStore = $state<string | null>(null)
  let priceInput = $state('')
  let priceUnitInput = $state('')
  let priceReduced = $state(false)
  let pricePermanent = $state(false)
  let priceInclDeposit = $state(false)
  let priceSaving = $state(false)
  let correctingProposalId = $state<string | null>(null)

  function startPriceEdit(storeId: string) {
    const existing = priceForStore(storeId)
    priceEditStore = storeId
    priceInput = existing ? String(existing.priceCt / 100).replace('.', ',') : ''
    priceUnitInput = existing?.unit ?? (product.defaultUnit as string) ?? 'piece'
    priceReduced = existing?.isReduced ?? false
    priceInclDeposit = existing?.priceIncludesDeposit ?? false
    pricePermanent = false
  }
  function cancelPriceEdit() {
    priceEditStore = null
    correctingProposalId = null
  }

  async function savePrice(storeId: string) {
    const euro = parseFloat(String(priceInput).replace(',', '.'))
    if (isNaN(euro) || euro < 0) { showToast('Preis muss eine Zahl >= 0 sein.', 'error'); return }
    priceSaving = true
    try {
      const res = await apiFetch(`/api/products/${product.id}/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          priceCt: Math.round(euro * 100),
          unit: priceUnitInput,
          isReduced: priceReduced,
          priceIncludesDeposit: priceInclDeposit,
          makePermanent: pricePermanent,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        showToast(b?.error ?? 'Fehler beim Speichern des Preises', 'error')
        return
      }
      showToast('Preis gespeichert')
      priceEditStore = null
      // „Korrigieren"-Fluss: den offenen Vorschlag danach als erledigt verwerfen.
      if (correctingProposalId) {
        const pid = correctingProposalId
        correctingProposalId = null
        await apiFetch(`/api/products/${product.id}/prices/proposals/${pid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'reject' }),
        }).catch(() => {})
      }
      await invalidateAll()
    } catch {
      showToast('Netzwerkfehler.', 'error')
    } finally {
      priceSaving = false
    }
  }

  // ── Online-Preis-Vorschläge (Block F2, Staging) ────────────────────────────
  type ProposedPrice = {
    id: string
    storeId: string
    priceCt: number
    unit: string
    store: { id: string; name: string; chain: string | null } | null
  }
  const proposedPrices = $derived((data.proposedPrices as ProposedPrice[]) ?? [])
  const priceScrapeEnabled = $derived(data.priceScrapeEnabled ?? false)
  function proposalForStore(storeId: string): ProposedPrice | undefined {
    return proposedPrices.find((p) => p.storeId === storeId)
  }

  let fetchingStore = $state<string | null>(null)
  let proposalBusy = $state<string | null>(null)

  async function fetchOnlinePrice(storeId: string) {
    fetchingStore = storeId
    try {
      const res = await apiFetch(`/api/products/${product.id}/prices/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(b?.error ?? `Fehler ${res.status}`, 'error')
        return
      }
      if (!b?.proposed) {
        showToast('Kein Online-Preis gefunden')
        return
      }
      showToast('Online-Preis abgerufen — als Vorschlag hinterlegt')
      await invalidateAll()
    } catch {
      showToast('Netzwerkfehler beim Abruf.', 'error')
    } finally {
      fetchingStore = null
    }
  }

  async function actOnProposal(
    proposalId: string,
    action: 'confirm' | 'reject',
    extra?: { makePermanent?: boolean; priceCt?: number; unit?: string; isReduced?: boolean },
  ) {
    proposalBusy = proposalId
    try {
      const res = await apiFetch(`/api/products/${product.id}/prices/proposals/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) {
        showToast(b?.error ?? `Fehler ${res.status}`, 'error')
        return
      }
      showToast(action === 'confirm' ? 'Vorschlag übernommen' : 'Vorschlag verworfen')
      await invalidateAll()
    } catch {
      showToast('Netzwerkfehler.', 'error')
    } finally {
      proposalBusy = null
    }
  }

  // „Korrigieren": öffnet den bestehenden Preis-Edit-Block mit den Vorschlagswerten
  // vorbefüllt; Speichern läuft über savePrice (legt einen bestätigten Preis an) und
  // der offene Vorschlag wird danach verworfen.
  function correctProposal(p: ProposedPrice) {
    priceEditStore = p.storeId
    priceInput = String(p.priceCt / 100).replace('.', ',')
    priceUnitInput = p.unit
    priceReduced = false
    pricePermanent = false
    correctingProposalId = p.id
  }

  // ── Gebinde-Größe (Einheiten v2, G7) ──────────────────────────────────────
  // Ein Gebinde macht die count-Standard-Einheit des Artikels (z.B. "Flasche")
  // auf Volumen/Masse umrechenbar. Eingabe: Betrag + frei waehlbare mass/volume-
  // Einheit (g/kg/ml/l …); DB speichert immer in ml bzw. g. '' = kein Gebinde.
  // Ableitung des Anzeige-Werts/-Einheit aus dem gespeicherten ml/g-Wert.
  function packStateFromProduct(): { unit: string; val: string } {
    const vol = Number(product.defaultVolumeMl)
    const wt = Number(product.defaultWeightG)
    const disp = vol > 0
      ? pickPackDisplayUnit(vol, 'volume', unitMeta)
      : wt > 0
        ? pickPackDisplayUnit(wt, 'mass', unitMeta)
        : null
    return disp
      ? { unit: disp.unitSymbol, val: String(disp.value).replace('.', ',') }
      : { unit: '', val: '' }
  }
  let packUnit = $state<string>(packStateFromProduct().unit)
  let packVal = $state<string>(packStateFromProduct().val)
  let packSaving = $state(false)
  let packEditing = $state(false)

  // Nach invalidateAll() (Standard-Einheit/Gebinde geaendert / angeglichen) aendert
  // sich data.product; die lokalen Gebinde-States neu ableiten (nicht waehrend Bearbeitung).
  $effect(() => {
    if (packEditing) return
    const s = packStateFromProduct()
    packUnit = s.unit
    packVal = s.val
  })

  // ── Standard-Einheit editieren (G6) ──────────────────────────────────────
  let unitEditing = $state(false)
  let draftDefaultUnit = $state('')
  let unitSaving = $state(false)

  function startUnitEdit() {
    // Nur vorbelegen, wenn der aktuelle Wert eine bekannte Einheit ist. Ein
    // verwaister Wert (z.B. 'piece', wenn diese System-Einheit in der DB fehlt)
    // wuerde sonst wieder gebunden und liesse sich nicht aendern (G20-1). Dann
    // leer lassen → der Nutzer waehlt eine gueltige Einheit, der Save-Guard greift.
    draftDefaultUnit = units.some((u) => u.symbol === product.defaultUnit) ? product.defaultUnit : ''
    unitEditing = true
  }
  async function saveDefaultUnit() {
    // Guard: <select> kann sich auf einen Leer-/Falschwert zuruecksetzen, wenn der
    // Ist-Wert nicht in den Optionen war (G19-1). Leeren Wert nicht speichern.
    if (!draftDefaultUnit) { showToast('Bitte eine Einheit wählen', 'error'); return }
    unitSaving = true
    try {
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultUnit: draftDefaultUnit }),
      })
      if (!res.ok) { showToast('Fehler beim Speichern der Einheit', 'error'); return }
      showToast('Standard-Einheit gespeichert')
      unitEditing = false
      await invalidateAll()
    } catch {
      showToast('Netzwerkfehler.', 'error')
    } finally {
      unitSaving = false
    }
  }

  // ── „Alle auf eine Einheit angleichen" (Artikel + alle Bestände) (G6) ─────
  let normalizeOpen = $state(false)
  let normalizeUnit = $state('')
  let normalizeMode = $state<'relabel' | 'convert'>('relabel')
  let normalizeSaving = $state(false)

  function openNormalizeModal() {
    // Zieleinheit NUR mit einem gueltigen Wert vorbelegen. Ist product.defaultUnit
    // ein verwaister Wert (z.B. 'piece', wenn diese Einheit in der DB fehlt), wuerde
    // ein <select bind:value> darauf haengenbleiben und "Angleichen" mit 400
    // "Unbekannte Einheit" scheitern (G21-1, der "Eier"-Blocker). Dann erste
    // gueltige Einheit vorbelegen.
    normalizeUnit = units.some((u) => u.symbol === product.defaultUnit)
      ? product.defaultUnit
      : (units[0]?.symbol ?? '')
    normalizeMode = 'relabel'
    normalizeOpen = true
  }
  // Dimension der aktuell im Dialog gewählten Zieleinheit (für Beispiel/Modus-Hinweis).
  const normalizeTargetDim = $derived(
    (units.find((u) => u.symbol === normalizeUnit)?.dimension ?? 'count') as 'mass' | 'volume' | 'count',
  )
  async function runNormalize() {
    normalizeSaving = true
    try {
      const res = await apiFetch(`/api/products/${product.id}/normalize-unit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit: normalizeUnit, mode: normalizeMode }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { showToast(b?.error ?? 'Fehler beim Angleichen', 'error'); return }
      showToast(`Angeglichen: ${b.items} Bestände (${b.converted} umgerechnet, ${b.relabeled} umbenannt)`)
      normalizeOpen = false
      await invalidateAll()
      // Bestandsliste rendert aus lokalem $state `siblings` (nicht aus data) →
      // nach dem Reload neu aus data.siblings uebernehmen, damit die angeglichenen
      // Einheiten/Mengen der Bestaende ohne Browser-Refresh sichtbar sind.
      siblings = data.siblings as Sibling[]
    } catch {
      showToast('Netzwerkfehler.', 'error')
    } finally {
      normalizeSaving = false
    }
  }

  async function savePack() {
    packSaving = true
    try {
      // Gewaehlte Einheit → ml/g via toBaseFactor. Leere Einheit = kein Gebinde.
      const um = packUnit ? unitMeta.get(packUnit) : undefined
      const val = Number(String(packVal).replace(',', '.'))
      const hasPack = !!um && Number.isFinite(val) && val > 0
      const baseVal = hasPack ? val * um!.toBaseFactor : null
      const packDimension = hasPack ? um!.dimension : 'none'
      const res = await apiFetch(`/api/products/${product.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packDimension,
          packSize: baseVal,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        showToast(b?.error ?? 'Fehler beim Speichern der Gebinde-Größe', 'error')
        return
      }
      showToast('Gebinde-Größe gespeichert')
      packEditing = false
      await invalidateAll()
    } catch {
      showToast('Netzwerkfehler.', 'error')
    } finally {
      packSaving = false
    }
  }


  function expiryOf(bestBeforeDate: string | null) {
    if (!bestBeforeDate) return { label: '⚠ Kein MHD', cls: 'mhd-none' }
    const d = new Date(bestBeforeDate)
    const st = getExpiryStatus(d, data.expirySettings.graceDaysAfter, {
      yellowDaysBefore: data.expirySettings.yellowDaysBefore,
      redDaysBefore: data.expirySettings.redDaysBefore,
    })
    const days = getDaysRemaining(d, data.expirySettings.graceDaysAfter)
    return { label: getExpiryLabel(st, days), cls: EXPIRY_CLASS[st] }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'consumed': return 'Verbraucht'
      case 'expired': return 'Abgelaufen'
      case 'donated': return 'Gespendet'
      case 'discarded': return 'Entsorgt'
      default: return ''
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Nutrients editor (product-wide)
  // ═══════════════════════════════════════════════════════════════════════════

  // svelte-ignore state_referenced_locally
  let nutrientRows = $state<NutrientEditRow[]>(
    (product.nutrients ?? []).map((n: { nutrientTypeId: string; valuePer100: string; source?: string }) => ({
      nutrientTypeId: n.nutrientTypeId,
      valuePer100: String(n.valuePer100),
      source: n.source ?? 'manual',
    }))
  )

  // Types not yet used in a row (avoid duplicate selection)
  const availableTypes = $derived(
    nutrientTypes.filter((t) => !nutrientRows.some((r) => r.nutrientTypeId === t.id))
  )

  // Hierarchische Sortierung der Naehrwert-Zeilen (G16-4): Parents nach sortOrder,
  // Children (parentId gesetzt) direkt unter ihrem Parent + eingerueckt. Basiert auf
  // nutrient_types.sortOrder/parentId — deckt auch Custom-Typen ab.
  const nutrientOrder = $derived.by(() => {
    const byId = new Map(nutrientTypes.map((t) => [t.id, t]))
    const order = new Map<string, number>() // typeId → globaler Rang
    const roots = nutrientTypes
      .filter((t) => !t.parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'))
    let rank = 0
    for (const root of roots) {
      order.set(root.id, rank++)
      const children = nutrientTypes
        .filter((t) => t.parentId === root.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'de'))
      for (const c of children) order.set(c.id, rank++)
    }
    return { order, byId }
  })
  const sortedNutrientRows = $derived(
    [...nutrientRows]
      .map((r) => ({ ...r, isChild: !!nutrientOrder.byId.get(r.nutrientTypeId)?.parentId }))
      .sort(
        (a, b) =>
          (nutrientOrder.order.get(a.nutrientTypeId) ?? 9999) -
          (nutrientOrder.order.get(b.nutrientTypeId) ?? 9999)
      )
  )

  let addingNutrient = $state(false)
  let selectedNewType = $state('')

  // Custom nutrient-type inline form
  let showCustomForm = $state(false)
  let customName = $state('')
  let customUnit = $state('g')
  let customSaving = $state(false)
  let fetchingOff = $state(false)

  // Nährwerte für die Artikel-EAN von OpenFoodFacts abrufen (on-demand, G12).
  // Nutzt den bestehenden /api/barcode/[gtin]-Pfad (schreibt product_nutrients
  // source='off'); danach Reload. Failsafe: kein Treffer → Toast, kein Crash.
  async function fetchNutrientsFromOff() {
    if (!product.gtin) { showToast('Artikel hat keine EAN', 'error'); return }
    fetchingOff = true
    try {
      const res = await apiFetch(`/api/barcode/${encodeURIComponent(product.gtin)}?refresh=nutrients`)
      const b = await res.json().catch(() => ({}))
      if (!res.ok || b?.found === false) {
        showToast('Keine Nährwerte bei OpenFoodFacts gefunden', 'error')
        return
      }
      // OFF lieferte zwar den Artikel, aber evtl. KEINE Naehrwerte → ehrliche Meldung.
      const gotNutrients = Array.isArray(b?.nutrients) && b.nutrients.length > 0
      await invalidateAll()
      // nutrientRows ist lokaler $state → nach dem Reload aus den FRISCHEN Loader-
      // Daten (data.product) neu seeden, NICHT aus dem $derived product (das nach
      // dem await noch den alten Wert haelt — G6-3/G9-1-Lehre).
      nutrientRows = (data.product.nutrients ?? []).map(
        (n: { nutrientTypeId: string; valuePer100: string; source?: string }) => ({
          nutrientTypeId: n.nutrientTypeId,
          valuePer100: String(n.valuePer100),
          source: n.source ?? 'off',
        })
      )
      showToast(
        gotNutrients
          ? 'Nährwerte von OpenFoodFacts übernommen'
          : 'OpenFoodFacts hat für diese EAN keine Nährwerte hinterlegt'
      )
    } catch {
      showToast('Netzwerkfehler beim Abruf', 'error')
    } finally {
      fetchingOff = false
    }
  }

  async function addNutrientRow() {
    if (!selectedNewType) return
    // Add row with value 0, persist immediately so it exists product-wide
    const typeId = selectedNewType
    selectedNewType = ''
    nutrientRows = [...nutrientRows, { nutrientTypeId: typeId, valuePer100: '0', source: 'manual' }]
    await saveNutrient(typeId, '0')
  }

  async function saveNutrient(nutrientTypeId: string, valuePer100: string) {
    const value = Number(valuePer100)
    if (!Number.isFinite(value) || value < 0) {
      showToast('Ungültiger Wert', 'error')
      return
    }
    const res = await apiFetch(`/api/products/${product.id}/nutrients`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nutrientTypeId, valuePer100: value }),
    })
    if (!res.ok) {
      showToast('Fehler beim Speichern des Nährwerts', 'error')
      return
    }
    nutrientRows = nutrientRows.map((r) =>
      r.nutrientTypeId === nutrientTypeId ? { ...r, valuePer100: String(value), source: 'manual' } : r
    )
    showToast('Nährwert gespeichert')
  }

  async function deleteNutrientRow(nutrientTypeId: string) {
    const res = await apiFetch(
      `/api/products/${product.id}/nutrients?nutrientTypeId=${encodeURIComponent(nutrientTypeId)}`,
      { method: 'DELETE' }
    )
    if (!res.ok && res.status !== 204) {
      showToast('Fehler beim Löschen', 'error')
      return
    }
    nutrientRows = nutrientRows.filter((r) => r.nutrientTypeId !== nutrientTypeId)
    showToast('Nährwert entfernt')
  }

  async function createCustomNutrient() {
    const name = customName.trim()
    const unit = customUnit.trim()
    if (!name || !unit) { showToast('Name und Einheit erforderlich', 'error'); return }
    customSaving = true
    try {
      const res = await apiFetch('/api/nutrient-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unit }),
      })
      const type = await res.json().catch(() => null)
      if (!res.ok || !type?.id) {
        showToast(String(type?.error ?? 'Fehler beim Anlegen'), 'error')
        return
      }
      if (!nutrientTypes.some((t) => t.id === type.id)) {
        nutrientTypes = [...nutrientTypes, type]
      }
      showCustomForm = false
      customName = ''
      customUnit = 'g'
      // Add a row for it right away
      nutrientRows = [...nutrientRows, { nutrientTypeId: type.id, valuePer100: '0', source: 'manual' }]
      await saveNutrient(type.id, '0')
    } finally {
      customSaving = false
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Stock entries (siblings) — list + inline edit
  // ═══════════════════════════════════════════════════════════════════════════

  // svelte-ignore state_referenced_locally
  let siblings = $state<Sibling[]>(data.siblings as Sibling[])

  // Deeplink (G40): kommt man aus der Artikel-Ansicht auf einen bestimmten Bestand,
  // zu dieser Zeile scrollen + pulsierend hervorheben (5 s, dann entfernen). Nur sinnvoll
  // bei mehreren Beständen; nur im Browser (onMount). prefers-reduced-motion per CSS respektiert.
  // Der Scroll wird über doppeltes requestAnimationFrame verzögert: bei onMount ist das
  // Layout oberhalb (Produktbild/Karten) noch nicht final → ein synchroner scrollIntoView
  // landet an der falschen Position. scroll-margin-top (CSS) hält die Sticky-Navbar frei.
  onMount(() => {
    if (siblings.length <= 1) return
    // Artikel-Klick aus der Inventar-Ansicht (Product-/Item-View) haengt ?scroll=0 an:
    // Artikelseite normal laden, aber den Deeplink-Scroll+Flash bewusst ueberspringen.
    // window.location ist im onMount (nur Browser) sicher verfuegbar; kein $app/stores noetig.
    if (new URLSearchParams(window.location.search).get('scroll') === '0') return
    let flashTimer: ReturnType<typeof setTimeout> | undefined
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.getElementById(`stock-${data.item.id}`)
        if (!el) return
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('stock-entry--flash')
        flashTimer = setTimeout(() => el.classList.remove('stock-entry--flash'), 5000)
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      if (flashTimer) clearTimeout(flashTimer)
    }
  })

  let editingRowId = $state<string | null>(null)
  let draftQuantity = $state('')
  let draftUnit = $state('')
  let draftMhd = $state('')
  let draftStoreId = $state('')
  let draftPurchasePrice = $state('')

  function startRowEdit(row: Sibling) {
    editingRowId = row.id
    draftQuantity = String(row.quantity)
    draftUnit = row.unit
    draftMhd = row.bestBeforeDate ?? ''
    draftStoreId = row.storeId ?? ''
    draftPurchasePrice = row.purchasePriceCt != null ? String(row.purchasePriceCt / 100).replace('.', ',') : ''
  }
  function cancelRowEdit() { editingRowId = null }

  async function saveRow(row: Sibling) {
    // Kaufpreis dieses Bestands: leer -> null, sonst Euro -> Cent (wie savePrice).
    let purchasePriceCt: number | null | undefined = undefined
    const rawPrice = draftPurchasePrice.trim()
    if (rawPrice === '') {
      purchasePriceCt = null
    } else {
      const euro = parseFloat(rawPrice.replace(',', '.'))
      if (isNaN(euro) || euro < 0) { showToast('Kaufpreis muss eine Zahl >= 0 sein.', 'error'); return }
      purchasePriceCt = Math.round(euro * 100)
    }
    const patch = {
      quantity: draftQuantity,
      unit: draftUnit,
      bestBeforeDate: draftMhd || null,
      storeId: draftStoreId || null,
      purchasePriceCt,
    }
    const res = await apiFetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) { showToast('Fehler beim Speichern', 'error'); return }
    const store = availableStores.find((s) => s.id === draftStoreId) ?? null
    siblings = siblings.map((s) =>
      s.id === row.id
        ? { ...s, quantity: draftQuantity, unit: draftUnit, bestBeforeDate: draftMhd || null, storeId: draftStoreId || null, purchasePriceCt: purchasePriceCt ?? null, store }
        : s
    )
    editingRowId = null
    showToast('Bestand gespeichert')
    // Gesamtbestand oben kommt aus data.stockTotals (Server-Load) — neu laden.
    await invalidateAll()
  }

  async function consumeRow(row: Sibling) {
    const res = await apiFetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'consumed' }),
    })
    if (!res.ok) { showToast('Fehler', 'error'); return }
    const now = new Date().toISOString()
    siblings = siblings.map((s) => (s.id === row.id ? { ...s, status: 'consumed', consumedAt: now } : s))
    showToast('Als verbraucht markiert')
    await invalidateAll()
  }

  // Spenden / Entsorgen — analog consumeRow, anderer Zielstatus.
  async function setRowStatus(row: Sibling, status: 'donated' | 'discarded', label: string) {
    const res = await apiFetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { showToast('Fehler', 'error'); return }
    const now = new Date().toISOString()
    siblings = siblings.map((s) => (s.id === row.id ? { ...s, status, consumedAt: now } : s))
    showToast(label)
    await invalidateAll()
  }

  // Wiederherstellen (G41/G43): zurück auf 'available', consumedAt nullt der Server. Bei Menge 0
  // wird die neue Menge über ein stoqr-Modal abgefragt (nicht window.prompt).
  let restoreModal = $state<{ row: Sibling; qty: string } | null>(null)

  function restoreRow(row: Sibling) {
    if (parseFloat(row.quantity) <= 0) {
      restoreModal = { row, qty: '1' }
      return
    }
    void doRestoreRow(row)
  }

  function confirmRestoreModal() {
    if (!restoreModal) return
    const qty = Number(String(restoreModal.qty).replace(',', '.'))
    if (isNaN(qty) || qty <= 0) { showToast('Ungültige Menge', 'error'); return }
    const row = restoreModal.row
    restoreModal = null
    void doRestoreRow(row, String(qty))
  }

  async function doRestoreRow(row: Sibling, quantity?: string) {
    const body: { status: 'available'; quantity?: string } = { status: 'available' }
    if (quantity) body.quantity = quantity
    const res = await apiFetch(`/api/inventory/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) { showToast('Fehler', 'error'); return }
    siblings = siblings.map((s) =>
      s.id === row.id
        ? { ...s, status: 'available', consumedAt: null, quantity: body.quantity ?? s.quantity }
        : s
    )
    showToast('Wiederhergestellt')
    await invalidateAll()
  }

  async function deleteRow(row: Sibling) {
    const res = await apiFetch(`/api/inventory/${row.id}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Entfernen', 'error'); return }
    siblings = siblings.filter((s) => s.id !== row.id)
    showToast('Bestand entfernt')
    if (siblings.length === 0) { goto('/inventar'); return }
    // invalidateAll VOR einem etwaigen goto (hier kein goto mehr) — Gesamtbestand neu laden.
    await invalidateAll()
  }

  // ── Location picker (per sibling) ───────────────────────────────────────────

  let showLocationPicker = $state(false)
  let pickerTargetId = $state<string | null>(null)

  function openLocationPicker(rowId: string) {
    pickerTargetId = rowId
    showLocationPicker = true
  }
  function closeLocationPicker() {
    showLocationPicker = false
    pickerTargetId = null
  }

  async function selectPlace(placeId: string) {
    const rowId = pickerTargetId
    closeLocationPicker()
    if (!rowId) return
    const res = await apiFetch(`/api/inventory/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ placeId }),
    })
    if (!res.ok) { showToast('Fehler beim Speichern des Lagerorts', 'error'); return }
    // Rebuild locationPath for that row from allLocations
    let path: LocSegment[] = []
    for (const loc of data.allLocations) {
      for (const st of loc.storages) {
        for (const pl of st.places) {
          if (pl.id === placeId) {
            path = [
              { id: loc.id, name: loc.name, kind: 'location' },
              { id: st.id, name: st.name, kind: 'storage' },
              { id: pl.id, name: pl.name, kind: 'place' },
            ]
          }
        }
      }
    }
    siblings = siblings.map((s) => (s.id === rowId ? { ...s, placeId, locationPath: path } : s))
    showToast('Lagerort gespeichert')
  }

  // ── Product-wide destructive actions ────────────────────────────────────────

  async function deleteProductCatalog() {
    const res = await apiFetch(`/api/products/${product.id}`, { method: 'DELETE' })
    if (res.status === 409) {
      const b = await res.json().catch(() => ({}))
      showToast(String(b?.error ?? 'Produkt hat noch Bestände.'), 'error')
      return
    }
    if (!res.ok && res.status !== 204) { showToast('Fehler beim Löschen', 'error'); return }
    goto('/inventar')
  }

  // deleteAll: Pi nutzt die Server-Action (Form-POST); App hat keinen Server ->
  // per apiFetch->routeApp (POST /api/products/:id/delete-all) loeschen.
  async function submitDeleteAll() {
    if (__STOQR_TARGET__ === 'app') {
      try {
        const res = await apiFetch(`/api/products/${product.id}/delete-all`, { method: 'POST' })
        if (!res.ok && res.status !== 204) {
          const b = (await res.json().catch(() => ({}))) as { error?: string }
          showToast(String(b?.error ?? 'Fehler beim Löschen'), 'error')
          return
        }
        goto('/inventar')
      } catch {
        showToast('Fehler beim Löschen', 'error')
      }
      return
    }
    ;(document.getElementById('frm-del-all') as HTMLFormElement)?.submit()
  }
</script>

<div class="page">
  <!-- ── Back link ──────────────────────────────────────────────────────── -->
  <a href="/inventar" class="back-link">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Zurück zum Inventar
  </a>

  <!-- ── Product header card ────────────────────────────────────────────── -->
  <div class="card product-card">
    <div class="product-hero">
      {#if product.imageUrl}
        <img class="product-image" src={product.imageUrl} alt="" />
      {:else}
        <div class="product-image-placeholder" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <rect width="40" height="40" rx="8" fill="var(--color-primary-subtle)"/>
            <path d="M10 28l6-8 4 5 3-3 7 6" stroke="var(--color-primary)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="14" cy="18" r="3" stroke="var(--color-primary)" stroke-width="1.5" fill="none"/>
          </svg>
        </div>
      {/if}
      <div class="product-info">
        <h1 class="product-name">{product.name} <SourceBadge source={fieldSources.name} /></h1>
        {#if product.brand}<span class="product-brand">{product.brand} <SourceBadge source={fieldSources.brand} /></span>{/if}
        {#if product.category}<span class="product-category" title={product.category.parentId ? 'Unterkategorie' : undefined}>{#if product.category.parentId}<span class="cat-sub" aria-hidden="true">↳ </span>{/if}{product.category.name} <SourceBadge source={fieldSources.category} /></span>{/if}
        {#if product.imageUrl}<span class="product-img-source">Bild: <SourceBadge source={fieldSources.image} /></span>{/if}
        {#if product.gtin}
          <span class="product-ean" title="EAN / Barcode">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 3v10M4.5 3v10M6 3v10M9 3v10M11 3v10M13.5 3v10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            {product.gtin}
          </span>
        {/if}
      </div>
      <button class="product-edit-btn" type="button" onclick={() => (editProductOpen = true)}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        </svg>
        Bearbeiten
      </button>
    </div>
    {#if product.description}
      <p class="product-desc">{product.description}</p>
    {/if}
    <div class="stock-total">
      <span class="stock-total-label">Gesamtbestand</span>
      <span class="stock-total-value">{formatStockTotal(data.stockTotals)}</span>
      {#if data.stockTotals.itemCount > 0}
        <span class="stock-total-count">aus {data.stockTotals.itemCount} {data.stockTotals.itemCount === 1 ? 'Bestand' : 'Beständen'}</span>
      {/if}
      <button class="target-edit-btn" type="button" onclick={openInventoryModal}>Bestand korrigieren</button>
    </div>

    <!-- Soll-/Bedarf-Indikator (2b) -->
    <div class="target-row">
      {#if stockTarget && targetStatus}
        <span class="target-badge target-badge--{targetStatus.status}">{TARGET_LABEL[targetStatus.status]}</span>
        <span class="target-info">Soll: {Number(stockTarget.targetQuantity).toLocaleString('de-DE', { maximumFractionDigits: 3 })} {unitLabel(stockTarget.unit)}{#if stockTarget.minQuantity} · Min: {Number(stockTarget.minQuantity).toLocaleString('de-DE', { maximumFractionDigits: 3 })}{/if}</span>
        <button class="target-edit-btn" type="button" onclick={openTargetModal}>Bearbeiten</button>
      {:else}
        <button class="target-edit-btn" type="button" onclick={openTargetModal}>+ Soll-Bestand festlegen</button>
      {/if}
    </div>

    <!-- Standard-Einheit des Artikels (editierbar) + Angleichung aller Bestände -->
    <div class="pack-row">
      {#if unitEditing}
        <div class="pack-edit">
          <span class="pack-label">Standard-Einheit:</span>
          <select class="input" bind:value={draftDefaultUnit} aria-label="Standard-Einheit">
            {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
          </select>
          <button class="btn-save-inline" type="button" disabled={unitSaving} onclick={saveDefaultUnit}>Speichern</button>
          <button class="btn-cancel-inline" type="button" onclick={() => (unitEditing = false)}>Abbrechen</button>
        </div>
      {:else}
        <span class="pack-view">Standard-Einheit: <strong>{unitLabel(product.defaultUnit)}</strong>{#if product.defaultUnit && !units.some((u) => u.symbol === product.defaultUnit)}<span class="unit-orphan-hint" title="Diese Einheit ist im Haushalt nicht (mehr) vorhanden. Bitte über „Ändern“ eine gültige Einheit wählen.">unbekannte Einheit</span>{/if}</span>
        <button class="target-edit-btn" type="button" onclick={startUnitEdit}>Ändern</button>
        <button class="target-edit-btn" type="button" onclick={openNormalizeModal}>Alle angleichen…</button>
      {/if}
    </div>

    <!-- Gebinde-Größe (nur sinnvoll, wenn die Standard-Einheit eine Stückzahl-Einheit ist) -->
    {#if (units.find((u) => u.symbol === product.defaultUnit)?.dimension ?? 'count') === 'count'}
      <div class="pack-row">
        {#if packEditing}
          <div class="pack-edit">
            <span class="pack-label">1 {unitLabel(product.defaultUnit)} =</span>
            <input class="input pack-input" type="text" inputmode="decimal" placeholder="z.B. 40"
                   bind:value={packVal} disabled={!packUnit} aria-label="Gebinde-Größe" />
            <select class="input pack-dim" bind:value={packUnit} aria-label="Einheit der Gebinde-Größe">
              <option value="">— kein Gebinde</option>
              {#each packUnitOptions as u (u.symbol)}<option value={u.symbol}>{u.name} ({u.symbol})</option>{/each}
            </select>
            <button class="btn-save-inline" type="button" disabled={packSaving} onclick={savePack}>Speichern</button>
            <button class="btn-cancel-inline" type="button" onclick={() => (packEditing = false)}>Abbrechen</button>
          </div>
        {:else}
          <span class="pack-view">
            Gebinde:
            {#if Number(product.defaultVolumeMl) > 0}<strong>1 {unitLabel(product.defaultUnit)} = {packToDisplay(Number(product.defaultVolumeMl), 'volume', unitMeta)}</strong>
            {:else if Number(product.defaultWeightG) > 0}<strong>1 {unitLabel(product.defaultUnit)} = {packToDisplay(Number(product.defaultWeightG), 'mass', unitMeta)}</strong>
            {:else}<span class="pack-none">nicht hinterlegt</span>{/if}
          </span>
          <button class="target-edit-btn" type="button" onclick={() => (packEditing = true)}>
            {Number(product.defaultVolumeMl) > 0 || Number(product.defaultWeightG) > 0 ? 'Ändern' : 'Gebinde festlegen'}
          </button>
        {/if}
      </div>
    {/if}

    <!-- Pfand (G49): eigenstaendige Fakt-Zeile (NICHT im count-Gebinde-Block),
         read-only; Aendern ueber den Bearbeiten-Dialog. Nur bei count-Einheit. -->
    {#if product.hasDeposit && isCountUnit(product.defaultUnit, unitMeta)}
      <div class="pack-row">
        <span class="pack-view">Pfand: <DepositBadge depositCt={product.depositCt} /></span>
      </div>
    {/if}
  </div>

  <!-- ── Nutrients editor (product-wide) ────────────────────────────────── -->
  <div class="card">
    <div class="section-header nutrient-header">
      <h2 class="section-title">Nährwerte <span class="section-subtitle">pro 100 g / 100 ml</span></h2>
      {#if product.gtin}
        <button class="btn-primary btn-off" type="button" disabled={fetchingOff} onclick={fetchNutrientsFromOff}>
          {#if fetchingOff}<span class="spinner spinner--sm" aria-hidden="true"></span>{/if}
          Von OpenFoodFacts abrufen
        </button>
      {/if}
    </div>
    <p class="scope-hint">Diese Nährwerte gelten für alle Bestände dieses Artikels.</p>

    {#if nutrientRows.length === 0}
      <p class="empty-hint">Noch keine Nährwerte erfasst.</p>
    {:else}
      <div class="nutrient-list">
        {#each sortedNutrientRows as row (row.nutrientTypeId)}
          <div class="nutrient-row" class:nutrient-row--child={row.isChild}>
            <span class="nutrient-name">
              {nutrientName(row.nutrientTypeId)}
              <SourceBadge source={row.source === 'off' ? 'off' : 'manual'} />
            </span>
            <input
              class="input nutrient-value"
              type="number"
              min="0"
              step="0.01"
              value={row.valuePer100}
              onblur={(e) => saveNutrient(row.nutrientTypeId, (e.target as HTMLInputElement).value)}
              onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              aria-label="{nutrientName(row.nutrientTypeId)} Wert"
            />
            <span class="nutrient-unit">{nutrientUnit(row.nutrientTypeId)}</span>
            <button class="btn-icon-danger" type="button" aria-label="Nährwert entfernen" onclick={() => deleteNutrientRow(row.nutrientTypeId)}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M2 3.5h10M5 3.5V2.5h4v1M5.5 6v4M8.5 6v4M3 3.5l.7 8h6.6l.7-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- Add nutrient row -->
    <div class="nutrient-add">
      <select class="input" bind:value={selectedNewType} disabled={addingNutrient} aria-label="Nährstoff wählen">
        <option value="">+ Nährstoff hinzufügen…</option>
        {#each availableTypes as t (t.id)}
          <option value={t.id}>{t.name} ({t.unit})</option>
        {/each}
      </select>
      <button class="btn-primary" type="button" onclick={addNutrientRow} disabled={!selectedNewType}>Hinzufügen</button>
      <button class="btn-link" type="button" onclick={() => (showCustomForm = !showCustomForm)}>
        {showCustomForm ? 'Abbrechen' : 'Eigener Nährstoff'}
      </button>
    </div>

    {#if showCustomForm}
      <div class="custom-nutrient">
        <input class="input" type="text" placeholder="Name (z.B. Magnesium)" bind:value={customName} maxlength="128" aria-label="Name des Nährstoffs" />
        <input class="input custom-unit" type="text" placeholder="Einheit" bind:value={customUnit} maxlength="16" aria-label="Einheit" />
        <button class="btn-primary" type="button" onclick={createCustomNutrient} disabled={customSaving}>Anlegen</button>
      </div>
    {/if}
  </div>

  <!-- ── Märkte (Planung: wo einkaufbar) ────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Märkte <span class="section-subtitle">wo einkaufbar</span></h2>
    </div>
    <p class="scope-hint">Bestimmt, in welchem Markt-Einkauf dieser Artikel auftaucht, wenn Bedarf besteht.</p>
    {#if (data.availableStores as StoreOpt[]).length === 0}
      <p class="empty-hint">Keine Märkte angelegt. Unter Einstellungen → Märkte hinzufügen.</p>
    {:else}
      <div class="store-chips">
        {#each data.availableStores as s (s.id)}
          <button
            class="store-chip"
            class:store-chip--on={isStoreLinked(s.id)}
            type="button"
            disabled={storeSaving}
            onclick={() => toggleStore(s.id)}
          >
            {isStoreLinked(s.id) ? '✓ ' : ''}{s.name}{s.chain ? ` (${s.chain})` : ''}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Preise (je zugeordnetem Markt) ─────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Preise <span class="section-subtitle">je Markt</span></h2>
    </div>
    <p class="scope-hint">Der aktuelle Preis je Markt fließt in die Einkaufs-Schätzung ein. Angebotspreise nur mit „als Dauerpreis übernehmen".</p>
    {#if productStoreIds.length === 0}
      <p class="empty-hint">Erst oben Märkte zuordnen, dann Preise pflegen.</p>
    {:else}
      <div class="price-list">
        {#each (data.availableStores as StoreOpt[]).filter((s) => productStoreIds.includes(s.id)) as s (s.id)}
          {@const cp = priceForStore(s.id)}
          {@const prop = proposalForStore(s.id)}
          <div class="price-item">
            {#if priceEditStore === s.id}
              <div class="price-edit">
                <span class="price-store">{s.name}{s.chain ? ` (${s.chain})` : ''}</span>
                <div class="price-edit-row">
                  <input class="input price-input" type="text" inputmode="decimal" placeholder="z.B. 1,19" bind:value={priceInput} aria-label="Preis" />
                  <span class="price-cur">€ / </span>
                  <select class="input price-unit" bind:value={priceUnitInput} aria-label="Einheit">
                    {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
                  </select>
                </div>
                <div class="price-flags">
                  <label class="flag-label"><input type="checkbox" bind:checked={priceReduced} /> reduziert</label>
                  <label class="flag-label"><input type="checkbox" bind:checked={pricePermanent} /> als Dauerpreis</label>
                  <label class="flag-label"><input type="checkbox" bind:checked={priceInclDeposit} /> Preis enthält Pfand</label>
                </div>
                <div class="price-actions">
                  <button class="btn-save-inline" type="button" disabled={priceSaving} onclick={() => savePrice(s.id)}>Speichern</button>
                  <button class="btn-cancel-inline" type="button" onclick={cancelPriceEdit}>Abbrechen</button>
                </div>
              </div>
            {:else}
              <div class="price-view">
                <span class="price-store">{s.name}{s.chain ? ` (${s.chain})` : ''}</span>
                <span class="price-value">
                  {#if cp}
                    {fmtPrice(cp.priceCt)} / {cp.unit}
                    {#if cp.isReduced}<span class="price-badge">Angebot</span>{/if}
                    {#if cp.basePriceCt != null}
                      <span class="price-base" title="Grundpreis (gesetzlich ausgezeichnet)">{fmtBasePrice(cp.basePriceCt, cp.basePriceUnit)}</span>
                    {/if}
                    {#if priceRanking.cheapestStoreId === s.id}
                      <span class="price-cheapest" title="Günstigster Markt pro Basiseinheit">günstigster</span>
                    {:else if priceRanking.incomparableStoreIds.includes(s.id)}
                      <span class="price-incomp" title="Einheit nicht mit anderen Märkten vergleichbar">nicht vergleichbar</span>
                    {/if}
                  {:else}
                    <span class="price-none">kein Preis</span>
                  {/if}
                </span>
                <div class="price-view-actions">
                  {#if priceScrapeEnabled && s.scrapeUrl}
                    <button class="btn-edit-inline" type="button" disabled={fetchingStore === s.id} onclick={() => fetchOnlinePrice(s.id)}>
                      {fetchingStore === s.id ? 'Abruf…' : 'Online abrufen'}
                    </button>
                  {/if}
                  <button class="btn-edit-inline" type="button" onclick={() => startPriceEdit(s.id)}>
                    {cp ? 'Ändern' : 'Preis setzen'}
                  </button>
                </div>
              </div>
              {#if prop}
                <div class="price-proposal">
                  <div class="proposal-head">
                    <span class="proposal-badge">Vorschlag</span>
                    <span class="proposal-value">Online-Preis: {fmtPrice(prop.priceCt)} / {prop.unit}</span>
                  </div>
                  <div class="proposal-actions">
                    <button class="btn-save-inline" type="button" disabled={proposalBusy === prop.id} onclick={() => actOnProposal(prop.id, 'confirm')}>Übernehmen</button>
                    <button class="btn-edit-inline" type="button" disabled={proposalBusy === prop.id} onclick={() => correctProposal(prop)}>Korrigieren</button>
                    <button class="btn-cancel-inline" type="button" disabled={proposalBusy === prop.id} onclick={() => actOnProposal(prop.id, 'reject')}>Verwerfen</button>
                  </div>
                </div>
              {/if}
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Stock entries (siblings) ───────────────────────────────────────── -->
  <div class="card">
    <div class="section-header">
      <h2 class="section-title">Bestände <span class="section-subtitle">({siblings.length})</span></h2>
    </div>

    {#if siblings.length === 0}
      <p class="empty-hint">Keine Bestände. Über „Bestand hinzufügen" im Inventar anlegen.</p>
    {:else}
      <div class="stock-list">
        {#each siblings as row (row.id)}
          {@const exp = expiryOf(row.bestBeforeDate)}
          <div id="stock-{row.id}" class="stock-entry" class:stock-entry--current={row.id === data.item.id} class:stock-entry--consumed={row.status !== 'available'}>
            {#if editingRowId === row.id}
              <!-- Inline edit -->
              <div class="stock-edit">
                <div class="stock-edit-fields">
                  <label class="mini-field">
                    <span class="mini-label">Menge</span>
                    <input class="input" type="number" min="0" step="0.25" bind:value={draftQuantity} />
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">Einheit</span>
                    <select class="input" bind:value={draftUnit}>
                      {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
                    </select>
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">MHD</span>
                    <input class="input" type="date" bind:value={draftMhd} />
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">Markt</span>
                    <select class="input" bind:value={draftStoreId}>
                      <option value="">Kein Markt</option>
                      {#each availableStores as s (s.id)}<option value={s.id}>{s.name}{s.chain ? ` (${s.chain})` : ''}</option>{/each}
                    </select>
                  </label>
                  <label class="mini-field">
                    <span class="mini-label">Kaufpreis (€)</span>
                    <input class="input" type="text" inputmode="decimal" placeholder="z.B. 1,19" bind:value={draftPurchasePrice} />
                  </label>
                </div>
                <button class="btn-link" type="button" onclick={() => openLocationPicker(row.id)}>
                  Lagerort: {row.locationPath.length ? row.locationPath.map((p) => p.name).join(' › ') : 'wählen…'}
                </button>
                <div class="stock-edit-actions">
                  <button class="btn-primary" type="button" onclick={() => saveRow(row)}>Speichern</button>
                  <button class="btn-link" type="button" onclick={cancelRowEdit}>Abbrechen</button>
                </div>
              </div>
            {:else}
              <!-- Display -->
              <div class="stock-main">
                <span class="stock-qty">{row.quantity} {unitLabel(row.unit)}</span>
                <span class="stock-mhd {exp.cls}">{exp.label}</span>
                {#if row.status !== 'available'}
                  <span class="stock-status">
                    {statusLabel(row.status)}{#if row.consumedAt} · {formatRelativeDays(row.consumedAt)}{/if}
                  </span>
                {/if}
              </div>
              <div class="stock-meta">
                {#if row.bestBeforeDate}<span>MHD: {formatDate(row.bestBeforeDate)}</span>{/if}
                {#if row.store}<span>· {row.store.name}</span>{/if}
                {#if row.purchasePriceCt != null}<span>· Kaufpreis {fmtPrice(row.purchasePriceCt)}</span>{/if}
                {#if row.locationPath.length}<span>· {row.locationPath.map((p) => p.name).join(' › ')}</span>{/if}
              </div>
              <div class="stock-actions">
                <button class="btn-link" type="button" onclick={() => startRowEdit(row)}>Bearbeiten</button>
                {#if row.status === 'available'}
                  <button class="btn-link" type="button" onclick={() => consumeRow(row)}>Verbraucht</button>
                  <button class="btn-link" type="button" onclick={() => setRowStatus(row, 'donated', 'Als gespendet markiert')}>Gespendet</button>
                  <button class="btn-link" type="button" onclick={() => setRowStatus(row, 'discarded', 'Als entsorgt markiert')}>Entsorgt</button>
                {:else}
                  <button class="btn-link" type="button" onclick={() => restoreRow(row)}>Wiederherstellen</button>
                {/if}
                <button class="btn-link btn-link--danger" type="button" onclick={() => deleteRow(row)}>Entfernen</button>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ── Product-wide actions ───────────────────────────────────────────── -->
  <div class="card actions-card actions-card--danger">
    <button
      class="btn-delete-product"
      type="button"
      onclick={() => showConfirm(
        'Produkt aus Katalog entfernen?',
        `„${product.name}" wird aus dem Katalog entfernt. Nur möglich, wenn keine Bestände mehr existieren.`,
        () => { closeConfirm(); deleteProductCatalog() }
      )}
    >
      Produkt aus Katalog entfernen
    </button>
    <button
      class="btn-delete-all"
      type="button"
      onclick={() => showConfirm(
        'Artikel vollständig löschen?',
        'Produkt, alle Bestände und alle zugehörigen Nährwertangaben werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.',
        () => { closeConfirm(); submitDeleteAll() },
        'Alles löschen'
      )}
    >
      Alles löschen (inkl. Bestände)
    </button>
    <form id="frm-del-all" method="POST" action="?/deleteAll" style="display:none"></form>
  </div>
</div>

<!-- ── Location picker (Modal) ────────────────────────────────────────────── -->
<Modal open={showLocationPicker} title="Lagerort auswählen" size="md" onClose={closeLocationPicker}>
  {#if data.allLocations.length === 0}
    <p class="empty-hint">Keine Lagerorte vorhanden. Lege zuerst Räume an.</p>
  {:else}
    {#each data.allLocations as loc (loc.id)}
      <div class="picker-location">
        <div class="picker-location-name"><span class="picker-icon">{loc.icon ?? '📍'}</span> {loc.name}</div>
        {#each loc.storages as st (st.id)}
          <div class="picker-storage">
            <div class="picker-storage-name">{st.name}</div>
            {#if st.places.length > 0}
              <div class="picker-places">
                {#each st.places as pl (pl.id)}
                  <button class="picker-place-btn" type="button" onclick={() => selectPlace(pl.id)}>{pl.name}</button>
                {/each}
              </div>
            {:else}
              <p class="picker-no-places">Keine Fächer</p>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
  {#snippet footer()}
    <button class="btn-link" type="button" onclick={closeLocationPicker}>Abbrechen</button>
  {/snippet}
</Modal>

<!-- ── Einheit angleichen (Artikel + alle Bestände) ───────────────────────── -->
<Modal open={normalizeOpen} title="Einheit angleichen" size="sm" onClose={() => (normalizeOpen = false)}>
  <p class="norm-desc">
    Setzt die Standard-Einheit dieses Artikels <strong>und alle seine Bestände</strong>
    (auch verbrauchte, gespendete, entsorgte) auf eine Einheit. Betrifft nur diesen Artikel,
    nicht das übrige Inventar.
  </p>
  <label class="norm-field">
    <span class="norm-label">Zieleinheit</span>
    <select class="input" bind:value={normalizeUnit} aria-label="Zieleinheit">
      {#each units as u (u.id)}<option value={u.symbol}>{u.name}</option>{/each}
    </select>
  </label>
  <div class="norm-modes">
    <label class="norm-mode">
      <input type="radio" value="relabel" bind:group={normalizeMode} />
      <span>
        <strong>Nur umbenennen</strong> — Mengen bleiben gleich, nur die Einheit wird umgeschrieben.
        <em>Beispiel: „2 Packung“ → „2 {unitLabel(normalizeUnit)}“ (Zahl unverändert).</em>
      </span>
    </label>
    <label class="norm-mode">
      <input type="radio" value="convert" bind:group={normalizeMode} />
      <span>
        <strong>Menge umrechnen</strong> — wo möglich (gleiche mass/volume-Dimension) wird die Menge
        korrekt umgerechnet, sonst nur umbenannt.
        <em>Beispiel: „500 g“ → „0,5 kg“. Bei Stückzahl-Einheiten (Packung ↔ Flasche) nicht umrechenbar → nur umbenannt.</em>
      </span>
    </label>
  </div>
  {#if normalizeTargetDim === 'count' && normalizeMode === 'convert'}
    <p class="norm-warn">Zieleinheit ist eine Stückzahl-Einheit — hier wird nichts umgerechnet, nur umbenannt.</p>
  {/if}
  {#snippet footer()}
    <button class="btn-link" type="button" onclick={() => (normalizeOpen = false)}>Abbrechen</button>
    <button class="btn-primary" type="button" disabled={normalizeSaving} onclick={runNormalize}>
      {normalizeSaving ? 'Wird angeglichen…' : 'Angleichen'}
    </button>
  {/snippet}
</Modal>

<!-- ── Toasts ─────────────────────────────────────────────────────────────── -->
{#if toasts.length > 0}
  <div class="toast-container" role="status" aria-live="polite">
    {#each toasts as toast (toast.id)}
      <div class="toast" class:toast--error={toast.type === 'error'}>{toast.message}</div>
    {/each}
  </div>
{/if}

<!-- ── Bestandskorrektur / Inventur (Modal) ───────────────────────────────── -->
<Modal open={showInventoryModal} title="Bestand korrigieren" size="sm" onClose={() => (showInventoryModal = false)}>
  {#if invError}<p class="field-error">{invError}</p>{/if}

  {#if invStep === 1}
    <!-- Schritt 1: Zielmenge -->
    <p class="scope-hint">Gib den tatsächlichen aktuellen Bestand an. Im nächsten Schritt siehst du die geplante Verteilung und kannst sie anpassen, bevor sie übernommen wird.</p>
    <div class="target-form">
      {#if (data.stockTotals.groups as StockGroupView[]).length > 1}
        <label class="tf-field">
          <span class="tf-label">Einheit-Gruppe</span>
          <select class="input" bind:value={invUnit} onchange={onInvUnitChange}>
            {#each data.stockTotals.groups as g (g.displayUnit)}
              <option value={g.displayUnit}>{g.displayName}</option>
            {/each}
          </select>
        </label>
      {/if}
      <label class="tf-field">
        <span class="tf-label">Tatsächlicher Bestand ({unitLabel(invUnit)})</span>
        <input class="input" type="number" min="0" step="0.25" bind:value={invValue} />
      </label>
    </div>
  {:else}
    <!-- Schritt 2: editierbare Vorschau -->
    {#if invDirection === 'decrease'}
      <p class="scope-hint">Weniger vorhanden — die Differenz wird von den Beständen abgezogen (älteste MHD zuerst). Zeilen anpassbar. Zeilen mit 0 gelten als verbraucht.</p>
      <div class="adjust-lines">
        {#each invLines as line (line.id)}
          <div class="adjust-line">
            <span class="adjust-line-info">
              MHD: {line.bestBeforeDate ? formatDate(line.bestBeforeDate) : '—'}
              <span class="adjust-line-old">(war {line.oldQuantity} {unitLabel(line.unit)})</span>
            </span>
            <input class="input adjust-line-input" type="number" min="0" step="0.25" bind:value={line.newQuantity} />
          </div>
        {/each}
      </div>
    {:else}
      <p class="scope-hint">Mehr vorhanden — bestehende Bestände erhöhen oder eine neue Zeile anlegen?</p>
      <div class="up-mode-toggle" role="group" aria-label="Aufstock-Modus">
        <button type="button" class="up-mode-btn" class:active={invUpMode === 'existing'} disabled={invLines.length === 0} onclick={() => (invUpMode = 'existing')}>Bestehende erhöhen</button>
        <button type="button" class="up-mode-btn" class:active={invUpMode === 'new'} onclick={() => (invUpMode = 'new')}>Neue Zeile</button>
      </div>
      {#if invUpMode === 'existing'}
        <div class="adjust-lines">
          {#each invLines as line (line.id)}
            <div class="adjust-line">
              <span class="adjust-line-info">
                MHD: {line.bestBeforeDate ? formatDate(line.bestBeforeDate) : '—'}
                <span class="adjust-line-old">(war {line.oldQuantity} {unitLabel(line.unit)})</span>
              </span>
              <input class="input adjust-line-input" type="number" min="0" step="0.25" bind:value={line.newQuantity} />
            </div>
          {/each}
        </div>
      {:else}
        <div class="target-form">
          <label class="tf-field">
            <span class="tf-label">Neue Menge ({unitLabel(invUnit)})</span>
            <input class="input" type="number" min="0" step="0.25" bind:value={invNewQty} />
          </label>
          <label class="tf-field">
            <span class="tf-label">MHD (optional)</span>
            <input class="input" type="date" bind:value={invNewMhd} />
          </label>
        </div>
      {/if}
    {/if}
    <p class="adjust-total">Neuer Gesamtbestand: <strong>{invPreviewTotal()} {unitLabel(invUnit)}</strong></p>
  {/if}

  {#snippet footer()}
    {#if invStep === 1}
      <button class="btn-primary" type="button" disabled={invSaving} onclick={loadInventoryPreview}>Weiter</button>
    {:else}
      <button class="btn-link" type="button" disabled={invSaving} onclick={() => (invStep = 1)}>Zurück</button>
      <button class="btn-primary" type="button" disabled={invSaving} onclick={saveInventory}>Übernehmen</button>
    {/if}
  {/snippet}
</Modal>

<!-- ── Bestand wiederherstellen: Mengen-Abfrage (Menge 0, G43) ─────────────── -->
<Modal open={restoreModal !== null} title="Bestand wiederherstellen" size="sm" onClose={() => (restoreModal = null)}>
  {#if restoreModal}
    <p class="scope-hint">Dieser Bestand hat keine Menge mehr. Gib die Menge an, mit der er wiederhergestellt werden soll.</p>
    <label class="tf-field">
      <span class="tf-label">Menge ({unitLabel(restoreModal.row.unit)})</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={restoreModal.qty} />
    </label>
  {/if}
  {#snippet footer()}
    <button class="btn-link" type="button" onclick={() => (restoreModal = null)}>Abbrechen</button>
    <button class="btn-primary" type="button" onclick={confirmRestoreModal}>Wiederherstellen</button>
  {/snippet}
</Modal>

<!-- ── Soll-Bestand (Modal) ───────────────────────────────────────────────── -->
<Modal open={showTargetModal} title="Soll-Bestand festlegen" size="sm" onClose={() => (showTargetModal = false)}>
  <p class="scope-hint">Definiert den gewünschten Bestand dieses Artikels. Bei Unterschreitung entsteht Bedarf (später auf der Einkaufsliste).</p>
  {#if targetError}<p class="field-error">{targetError}</p>{/if}
  <div class="target-form">
    <label class="tf-field">
      <span class="tf-label">Soll-Menge {#if targetEffectiveUnit}<span class="tf-unit-hint">in {unitLabel(targetEffectiveUnit)}</span>{/if}</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={targetQtyInput} />
    </label>
    <label class="tf-field">
      <span class="tf-label">Mindestbestand (optional)</span>
      <input class="input" type="number" min="0" step="0.25" bind:value={targetMinInput} placeholder="z.B. 1" />
    </label>
  </div>
  {#snippet footer()}
    {#if stockTarget}
      <button class="btn-link btn-link--danger" type="button" onclick={deleteTarget}>Entfernen</button>
    {/if}
    <button class="btn-primary" type="button" disabled={targetSaving} onclick={saveTarget}>Speichern</button>
  {/snippet}
</Modal>

{#if confirmModal}
  <ConfirmModal
    open={confirmModal.open}
    title={confirmModal.title}
    message={confirmModal.message}
    confirmLabel={confirmModal.confirmLabel}
    destructive={true}
    onConfirm={confirmModal.onConfirm}
    onCancel={closeConfirm}
  />
{/if}

<ProductForm
  open={editProductOpen}
  product={{
    id: product.id,
    name: product.name,
    brand: product.brand,
    gtin: product.gtin,
    categoryId: product.categoryId,
    imageUrl: product.imageUrl,
    defaultUnit: product.defaultUnit,
    description: product.description,
    hasDeposit: product.hasDeposit,
    depositCt: product.depositCt,
  }}
  {categories}
  units={units}
  showUnit={false}
  {fieldSources}
  onSaved={onProductSaved}
  onClose={() => (editProductOpen = false)}
/>

<style>
  .page {
    max-width: 680px;
    margin: 0 auto;
    padding: var(--space-6) var(--space-4) var(--space-16);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .back-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--transition-fast);
    padding: var(--space-1) 0;
  }
  .back-link:hover { color: var(--color-primary); }

  .card {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-5) var(--space-5);
    box-shadow: var(--shadow-sm);
  }

  .section-header { margin-bottom: var(--space-3); }
  .section-title {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
  }
  .section-subtitle {
    font-size: var(--text-xs);
    font-weight: 500;
    color: var(--color-text-muted);
  }

  .scope-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0 0 var(--space-3);
  }
  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin: var(--space-1) 0;
  }

  .store-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .store-chip {
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    border-radius: var(--radius-full);
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
  }
  .store-chip:hover:not(:disabled) { border-color: var(--color-primary); }
  .store-chip--on { border-color: var(--color-primary); background: var(--color-primary-subtle); color: var(--color-primary); font-weight: 600; }
  .store-chip:disabled { opacity: 0.6; cursor: not-allowed; }

  /* ── Product header ─────────────────────────────────────────────────── */
  .product-hero { display: flex; gap: var(--space-4); align-items: flex-start; }
  .product-image-placeholder { flex-shrink: 0; }
  .product-image {
    flex-shrink: 0;
    width: 56px;
    height: 56px;
    object-fit: cover;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface-sunken);
  }
  .product-info { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1; }
  .product-ean {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: var(--color-text-muted);
    letter-spacing: 0.02em;
  }
  .product-edit-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .product-edit-btn:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background: var(--color-primary-subtle);
  }
  .product-name {
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0;
    word-break: break-word;
  }
  .product-brand, .product-category {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .product-category .cat-sub { color: var(--color-text-muted); }
  .product-desc {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .stock-total {
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border-subtle);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
  }
  .stock-total-label {
    font-size: var(--text-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-muted);
  }
  .stock-total-value {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
  }
  .stock-total-count {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
  }

  /* ── Soll/Bedarf ─────────────────────────────────────────────────────── */
  .target-row {
    margin-top: var(--space-3);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  .target-badge {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: 11px;
    font-weight: 700;
  }
  .target-badge--ok { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  .target-badge--below_target { background: #fef9c3; color: #ca8a04; }
  .target-badge--below_min { background: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); }
  .target-badge--not_comparable { background: var(--color-surface-sunken); color: var(--color-text-muted); }
  .target-info { font-size: var(--text-xs); color: var(--color-text-muted); }
  .target-edit-btn {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-primary);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
  }
  .target-edit-btn:hover { text-decoration: underline; }

  .target-form { display: flex; flex-direction: column; gap: var(--space-3); }
  .tf-field { display: flex; flex-direction: column; gap: var(--space-1); }
  .tf-label { font-size: var(--text-xs); color: var(--color-text-muted); }
  .tf-unit-hint { font-weight: 600; color: var(--color-text-secondary); }

  /* ── Bestandskorrektur-Vorschau (G42) ──────────────────────────────────── */
  .adjust-lines { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); }
  .adjust-line { display: flex; align-items: center; gap: var(--space-2); }
  .adjust-line-info { flex: 1; font-size: var(--text-sm); color: var(--color-text-secondary); }
  .adjust-line-old { color: var(--color-text-muted); font-size: var(--text-xs); }
  .adjust-line-input { width: 90px; flex-shrink: 0; }
  .adjust-total { margin-top: var(--space-3); font-size: var(--text-sm); color: var(--color-text-secondary); }
  .up-mode-toggle { display: inline-flex; gap: 2px; padding: 3px; border-radius: var(--radius-md); background: var(--color-surface-sunken); border: 1px solid var(--color-border); margin: var(--space-2) 0; }
  .up-mode-btn { appearance: none; border: none; background: transparent; color: var(--color-text-secondary); font-family: var(--font-body); font-size: var(--text-sm); font-weight: 600; padding: var(--space-1) var(--space-3); border-radius: calc(var(--radius-md) - 2px); cursor: pointer; }
  .up-mode-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .up-mode-btn.active { background: var(--color-surface-raised); color: var(--color-text-primary); box-shadow: var(--shadow-sm); }

  /* ── Inputs / buttons: Optik global; hier nur Layout + Sonderfaelle ─────── */
  .input {
    min-width: 0;
    width: 100%;
  }

  .btn-link {
    background: none;
    border: none;
    padding: var(--space-1) 0;
    color: var(--color-primary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-link:hover { color: var(--color-primary-hover); text-decoration: underline; }
  .btn-link--danger { color: var(--color-danger, #dc2626); }

  .btn-icon-danger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-muted);
    border-radius: var(--radius-md);
    cursor: pointer;
    flex-shrink: 0;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }
  .btn-icon-danger:hover {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Nutrient editor ─────────────────────────────────────────────────── */
  .nutrient-list { display: flex; flex-direction: column; gap: var(--space-2); margin-bottom: var(--space-3); }
  .nutrient-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .nutrient-row--child { padding-left: var(--space-4); }
  .nutrient-row--child .nutrient-name { color: var(--color-text-secondary); }
  .nutrient-name { flex: 1; font-size: var(--text-sm); color: var(--color-text-primary); min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  .product-img-source { font-size: var(--text-xs); color: var(--color-text-muted); }
  .nutrient-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
  .btn-off { flex-shrink: 0; }
  .nutrient-value { width: 96px; flex-shrink: 0; }
  .nutrient-unit { width: 36px; flex-shrink: 0; font-size: var(--text-xs); color: var(--color-text-muted); }

  /* Add-Zeile: placeholder-artiger, gestrichelter „Prognose"-Slot */
  .nutrient-add {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border: 1.5px dashed var(--color-border-strong, var(--color-border));
    border-radius: var(--radius-md);
    background: var(--color-surface-sunken);
    transition: border-color var(--transition-fast), background var(--transition-fast);
  }
  .nutrient-add:hover,
  .nutrient-add:focus-within {
    border-color: var(--color-primary);
    background: var(--color-primary-subtle);
  }
  .nutrient-add .input {
    flex: 1 1 180px;
    border-color: transparent;
    background: transparent;
  }
  .nutrient-add .input:focus {
    background: var(--color-surface);
    border-color: var(--color-border);
  }

  .custom-nutrient { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-3); }
  .custom-nutrient .input { flex: 1 1 160px; }
  .custom-nutrient .custom-unit { flex: 0 1 90px; }

  /* ── Stock list ──────────────────────────────────────────────────────── */
  .stock-list { display: flex; flex-direction: column; gap: var(--space-2); }
  .stock-entry {
    border: 1px solid var(--color-border-subtle);
    border-radius: var(--radius-md);
    padding: var(--space-3);
    background-color: var(--color-surface);
  }
  .stock-entry--current { border-color: var(--color-primary); background-color: var(--color-primary-subtle); }
  .stock-entry--consumed { opacity: 0.6; }

  /* Deeplink-Ziel (G40): scroll-margin-top hält die Zeile unter der 56px-Sticky-Navbar frei. */
  .stock-entry { scroll-margin-top: 72px; }

  /* Deeplink-Highlight (G40): pulsierendes Border-Glow, ~5 s lang, dann per JS entfernt. */
  .stock-entry--flash {
    animation: stock-flash 0.8s ease-in-out infinite;
  }
  @keyframes stock-flash {
    0%, 100% { box-shadow: 0 0 0 0 rgba(196, 103, 58, 0.35); border-color: var(--color-primary); }
    50% { box-shadow: 0 0 0 4px var(--color-primary); border-color: var(--color-primary); }
  }
  @media (prefers-reduced-motion: reduce) {
    .stock-entry--flash { animation: none; box-shadow: 0 0 0 2px var(--color-primary); }
  }

  .stock-main { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .stock-qty { font-size: var(--text-base); font-weight: 700; color: var(--color-text-primary); }
  .stock-mhd {
    font-size: var(--text-xs);
    font-weight: 600;
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
  }
  .stock-status {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-text-muted);
    padding: 2px var(--space-2);
    border-radius: var(--radius-full);
    background: var(--color-surface-sunken);
  }
  .stock-meta {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
  }
  .stock-actions { display: flex; gap: var(--space-3); margin-top: var(--space-2); flex-wrap: wrap; }

  .stock-edit { display: flex; flex-direction: column; gap: var(--space-2); }
  .stock-edit-fields { display: flex; gap: var(--space-2); flex-wrap: wrap; }
  .mini-field { display: flex; flex-direction: column; gap: 2px; flex: 1 1 120px; min-width: 0; }
  .mini-label { font-size: var(--text-xs); color: var(--color-text-muted); }
  .stock-edit-actions { display: flex; gap: var(--space-3); align-items: center; }

  /* MHD badge colors (shared classes from expiry utils) */
  :global(.mhd-fresh) { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  :global(.mhd-ok) { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); }
  :global(.mhd-soon) { background: #fef9c3; color: #ca8a04; }
  :global(.mhd-critical) { background: #ffedd5; color: #ea580c; }
  :global(.mhd-expired) { background: var(--color-danger-subtle, #fee2e2); color: var(--color-danger, #dc2626); }
  :global(.mhd-none) { background: #fff7ed; color: #c2410c; border: 1px dashed #fdba74; }

  /* ── Actions card ────────────────────────────────────────────────────── */
  .actions-card { display: flex; flex-direction: column; gap: var(--space-2); }
  .actions-card--danger { border-color: rgba(220, 38, 38, 0.25); }
  .btn-delete-product, .btn-delete-all {
    height: 40px;
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    transition: border-color var(--transition-fast), color var(--transition-fast), background-color var(--transition-fast);
  }
  .btn-delete-all { color: var(--color-danger, #dc2626); }
  .btn-delete-product:hover, .btn-delete-all:hover {
    border-color: var(--color-danger, #dc2626);
    color: var(--color-danger, #dc2626);
    background-color: var(--color-danger-subtle, #fee2e2);
  }

  /* ── Location picker (im Modal) ──────────────────────────────────────── */
  .picker-location { margin-bottom: var(--space-4); }
  .picker-location-name { font-weight: 700; font-size: var(--text-sm); margin-bottom: var(--space-2); }
  .picker-storage { margin-left: var(--space-3); margin-bottom: var(--space-2); }
  .picker-storage-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); margin-bottom: var(--space-1); }
  .picker-places { display: flex; flex-wrap: wrap; gap: var(--space-2); }
  .picker-place-btn {
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--text-sm);
    cursor: pointer;
  }
  .picker-place-btn:hover { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .picker-no-places { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0; }
  .picker-icon { margin-right: var(--space-1); }

  /* ── Toast ───────────────────────────────────────────────────────────── */
  .toast-container {
    position: fixed;
    bottom: calc(var(--space-6) + 64px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 600;
    display: flex; flex-direction: column; gap: var(--space-2); align-items: center;
    pointer-events: none;
  }
  .toast {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--color-accent, #1f2937);
    color: var(--color-text-inverse, #fff);
    font-size: var(--text-sm);
    font-weight: 500;
    box-shadow: var(--shadow-lg);
  }
  .toast--error { background: var(--color-danger, #dc2626); }

  /* ── Responsive ──────────────────────────────────────────────────────── */
  @media (max-width: 560px) {
    .page { padding: var(--space-4) var(--space-3) var(--space-12); }
    .card { padding: var(--space-4); }
    .stock-edit-fields .mini-field { flex-basis: 100%; }
    .nutrient-add .input { flex-basis: 100%; }
    .toast-container { left: var(--space-4); right: var(--space-4); transform: none; }
    .toast { width: 100%; text-align: center; }
  }

  /* ── Preise-Card (Block F) ────────────────────────────────────────────── */
  .price-list { display: flex; flex-direction: column; gap: var(--space-2); }
  .price-item { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); }
  .price-view { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .price-store { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); flex: 1; min-width: 0; }
  .price-value { font-size: var(--text-sm); color: var(--color-text-secondary); display: inline-flex; align-items: center; gap: var(--space-2); }
  .price-none { color: var(--color-text-muted); font-style: italic; }
  .price-badge { background: #fff7ed; color: #c2410c; border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: 10px; font-weight: 700; }
  .price-cheapest { background: var(--color-success-subtle, #dcfce7); color: var(--color-success, #16a34a); border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: 10px; font-weight: 700; }
  .price-incomp { color: var(--color-text-muted); font-size: 10px; font-style: italic; }
  .price-base { color: var(--color-text-muted); font-size: var(--text-xs); font-weight: 600; margin-left: var(--space-1); }
  .price-edit { display: flex; flex-direction: column; gap: var(--space-2); }
  .price-edit-row { display: flex; align-items: center; gap: var(--space-2); }
  .price-input { flex: 0 1 110px; }
  .price-unit { flex: 0 1 140px; }
  .price-cur { color: var(--color-text-muted); font-weight: 600; }
  .price-flags { display: flex; flex-wrap: wrap; gap: var(--space-3); }
  .flag-label { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--text-sm); color: var(--color-text-secondary); cursor: pointer; }
  .price-actions { display: flex; gap: var(--space-2); }
  .btn-save-inline { border: none; background: var(--color-primary); color: var(--color-text-inverse); border-radius: var(--radius-md); height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); font-weight: 600; cursor: pointer; }
  .btn-save-inline:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-cancel-inline { border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); border-radius: var(--radius-md); height: 32px; padding: 0 var(--space-3); font-size: var(--text-xs); font-weight: 500; cursor: pointer; }
  .btn-edit-inline { border: 1px solid var(--color-border); background: transparent; color: var(--color-primary); border-radius: var(--radius-md); height: 30px; padding: 0 var(--space-3); font-size: var(--text-xs); font-weight: 600; cursor: pointer; flex-shrink: 0; }
  .btn-edit-inline:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .price-view-actions { display: inline-flex; gap: var(--space-2); flex-shrink: 0; }
  .btn-edit-inline:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-cancel-inline:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Online-Preis-Vorschlag (Block F2, Staging) ───────────────────────── */
  .price-proposal { margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px dashed var(--color-border); display: flex; flex-direction: column; gap: var(--space-2); }
  .proposal-head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .proposal-badge { background: var(--color-primary-subtle); color: var(--color-primary); border-radius: var(--radius-full); padding: 0 var(--space-2); font-size: 10px; font-weight: 700; }
  .proposal-value { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .proposal-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

  /* ── Gebinde-Größe (Einheiten v2) ─────────────────────────────────────── */
  .pack-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; margin-top: var(--space-3); padding-top: var(--space-3); border-top: 1px solid var(--color-border-subtle); }
  .pack-view { font-size: var(--text-sm); color: var(--color-text-secondary); flex: 1; min-width: 0; }
  .pack-view strong { color: var(--color-text-primary); }
  .unit-orphan-hint { display: inline-block; margin-left: 6px; font-size: 9px; font-weight: 700; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--color-danger, #dc2626) 16%, transparent); color: var(--color-danger, #dc2626); text-transform: uppercase; letter-spacing: 0.03em; cursor: help; }
  .pack-none { color: var(--color-text-muted); font-style: italic; }
  .pack-edit { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; flex: 1; }
  .pack-label { font-size: var(--text-sm); color: var(--color-text-secondary); }
  .pack-input { flex: 0 1 90px; }
  .pack-dim { flex: 0 1 150px; }

  /* ── Einheit-Angleichung-Modal (G6) ───────────────────────────────────── */
  .norm-desc { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; margin: 0 0 var(--space-4); }
  .norm-field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-4); }
  .norm-label { font-size: var(--text-xs); font-weight: 600; color: var(--color-text-secondary); }
  .norm-modes { display: flex; flex-direction: column; gap: var(--space-3); }
  .norm-mode { display: flex; gap: var(--space-2); align-items: flex-start; font-size: var(--text-sm); color: var(--color-text-primary); cursor: pointer; line-height: 1.5; }
  .norm-mode input { margin-top: 3px; accent-color: var(--color-primary); }
  .norm-mode em { display: block; color: var(--color-text-muted); font-size: var(--text-xs); margin-top: 2px; }
  .norm-warn { font-size: var(--text-xs); color: #c2410c; background: #fff7ed; border-radius: var(--radius-md); padding: var(--space-2) var(--space-3); margin: var(--space-3) 0 0; }
</style>
