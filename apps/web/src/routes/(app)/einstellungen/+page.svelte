<script lang="ts">
  import { enhance } from '$app/forms'
  import { apiFetch } from '$lib/client/api'
  import { invalidateAll } from '$app/navigation'
  import { toast } from '$lib/stores/toast'
  import Modal from '$lib/components/Modal.svelte'
  import SyncSettings from '$lib/components/SyncSettings.svelte'
  import { buildCategoryTree } from '$lib/utils/category-tree'
  import { resolveMirrorCategory, mirrorCategoryTag, canTakeMirrorPrice, defaultSnapFields, mirrorSubmitCategoryId } from '$lib/utils/mirror-category'
  import type { PageData, ActionData } from './$types'

  // ── Props ──────────────────────────────────────────────────────────────────

  let { data, form }: { data: PageData; form: ActionData } = $props()

  // Kategorien als Baum (eingerueckte Optionen im Katalog-Spiegel-Select, G27).
  const catIndent = (depth: number) => (depth > 0 ? String.fromCharCode(160).repeat(depth * 4) : '')
  const categoryTree = $derived(
    buildCategoryTree(
      (data.categories as { id: string; name: string; icon: string | null; parentId: string | null; sortOrder: number }[]).map((c) => ({
        id: c.id, name: c.name, icon: c.icon, parentId: c.parentId, sortOrder: c.sortOrder,
      }))
    )
  )

  // ── Global tolerance state ─────────────────────────────────────────────────

  // svelte-ignore state_referenced_locally
  let yellowDays = $state(data.expiryConfig.yellowDaysBefore)
  // svelte-ignore state_referenced_locally
  let redDays = $state(data.expiryConfig.redDaysBefore)
  // svelte-ignore state_referenced_locally
  let graceDays = $state(data.expiryConfig.graceDaysAfter)
  let globalSaving = $state(false)

  // ── Online-Preis-Abruf-Schalter (G4) ────────────────────────────────────────
  // svelte-ignore state_referenced_locally
  let priceScrapeEnabled = $state(data.priceScrapeEnabled ?? false)
  let priceScrapeSaving = $state(false)

  // App-Target: es gibt keinen Server -> die SvelteKit-Form-Action
  // ?/updatePriceScrape laeuft nie (Fehler). Statt dessen ueber apiFetch ->
  // routeApp den Flag on-device persistieren (wie die uebrigen App-Mutationen
  // dieser Seite, z.B. runCatalogSync). Der Pi nutzt weiter die Form-Action.
  async function togglePriceScrapeApp(next: boolean) {
    priceScrapeSaving = true
    try {
      const res = await apiFetch('/api/settings/price-scrape', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      if (!res.ok) {
        priceScrapeEnabled = !next // zuruecksetzen
        toast.error('Konnte den Online-Preis-Abruf nicht speichern.')
        return
      }
      await invalidateAll()
    } catch {
      priceScrapeEnabled = !next
      toast.error('Netzwerkfehler.')
    } finally {
      priceScrapeSaving = false
    }
  }

  // ── Katalog-Sicherung: EAN-Spiegel des Bestands (G10) ────────────────────────
  type FieldDiff = { differs: boolean; fillsGap: boolean }
  type MirrorRow = {
    product: {
      id: string
      name: string
      gtin: string
      imageUrl: string | null
      categoryId: string | null
      categoryName: string | null
      brand: string | null
      description: string | null
      hasDeposit: boolean
      categorySource: 'off' | 'globus' | 'manual' | null
    }
    snapshot: {
      id: string
      name: string | null
      category: string[] | null
      priceCt: number | null
      currency: string | null
      storeId: string | null
      localImagePath: string | null
      catalogCategoryId: string | null
      brand: string | null
      description: string | null
      hasDeposit: boolean | null
      extracted: { field: string; value: string | null; source: string; belongsTo: string }[] | null
      fetchedAt: string
    } | null
    diff: { name: FieldDiff; image: FieldDiff; category: FieldDiff; brand: FieldDiff; description: FieldDiff; hasDeposit: FieldDiff; any: boolean }
  }
  // Spiegel direkt aus den (reaktiven) Load-Daten ableiten — nach jedem
  // invalidateAll() automatisch aktuell (kein manuelles, stale-anfaelliges Setzen).
  const catalogMirror = $derived((data.catalogMirror as MirrorRow[]) ?? [])
  const mirrorDeviations = $derived(catalogMirror.filter((r) => r.diff.any).length)
  let syncing = $state(false)
  let snapshotBusy = $state<string | null>(null)
  // Dauerhafte Warnung nach dem letzten Sync (nicht nur fluechtiger Toast, G10-3).
  let syncWarning = $state<string | null>(null)

  function fmtSnapPrice(ct: number | null): string {
    if (ct == null) return '—'
    return (ct / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  }

  async function runCatalogSync() {
    syncing = true
    syncWarning = null
    try {
      const res = await apiFetch('/api/catalog/sync', { method: 'POST' })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(String(b?.error ?? `Fehler ${res.status}`)); return }
      const parts = [`${b.proposedCreated ?? 0} neu`, `${b.unchanged ?? 0} unverändert`]
      if (b.skipped) parts.push(`${b.skipped} übersprungen`)
      if (b.failed) parts.push(`${b.failed} fehlgeschlagen`)
      toast.success(parts.join(', '))
      // Dauerhafte Warn-Card statt fluechtigem Toast (G10-3).
      if (b.structureWarning) {
        syncWarning =
          'Globus lieferte für vorhandene EANs keine Treffer — die Katalog-Struktur hat sich möglicherweise geändert.'
      } else if (b.noValidUrl) {
        syncWarning =
          'Kein Markt mit gültiger Abruf-URL. Hinterlege beim Markt eine URL mit dem Platzhalter {EAN}.'
      }
      // Liste aktualisiert sich reaktiv ueber data (catalogMirror ist $derived).
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler beim Katalog-Abruf.')
    } finally {
      syncing = false
    }
  }

  // Preis nur uebernehmbar, wenn der Snapshot einen Preis UND einen Markt-Bezug
  // hat (product_prices ist markt-gebunden) — G13-2.
  const canTakePrice = (r: MirrorRow) => canTakeMirrorPrice({ priceCt: r.snapshot?.priceCt ?? null, storeId: r.snapshot?.storeId ?? null })
  // Angekreuzte Uebernahme-Felder je Snapshot. Als $derived DIREKT aus dem Spiegel
  // aufgebaut — dadurch ist der Eintrag bereits beim ERSTEN Render vorhanden (kein
  // $effect-Race, der frueher Badge und Panel auseinanderlaufen liess, G14-3).
  // Nutzer-Toggles bleiben ueber ein untracked Overlay erhalten.
  const snapFieldOverrides: Record<string, { image: boolean; name: boolean; category: boolean; price: boolean; brand: boolean; description: boolean; hasDeposit: boolean }> = {}
  let catalogMirrorTick = $state(0)
  const snapFields = $derived.by(() => {
    void catalogMirrorTick // Abhaengigkeit: Neuberechnung nach einem Toggle erzwingen.
    const out: Record<string, { image: boolean; name: boolean; category: boolean; price: boolean; brand: boolean; description: boolean; hasDeposit: boolean }> = {}
    for (const r of catalogMirror) {
      if (!r.snapshot) continue
      out[r.snapshot.id] = snapFieldOverrides[r.snapshot.id] ?? {
        ...defaultSnapFields({
          imageDiffers: r.diff.image.differs,
          nameDiffers: r.diff.name.differs,
          categoryDiffers: r.diff.category.differs,
          priceCt: r.snapshot.priceCt,
          storeId: r.snapshot.storeId,
          brandDiffers: r.diff.brand?.differs ?? false,
          descriptionDiffers: r.diff.description?.differs ?? false,
        }),
        hasDeposit: r.diff.hasDeposit?.differs ?? false,
      }
    }
    return out
  })
  // Checkbox-Toggle: schreibt ins Overlay (bleibt erhalten) + triggert Neuberechnung.
  function toggleSnapField(id: string, field: 'image' | 'name' | 'category' | 'price' | 'brand' | 'description' | 'hasDeposit') {
    const cur = snapFields[id]
    if (!cur) return
    snapFieldOverrides[id] = { ...cur, [field]: !cur[field] }
    catalogMirrorTick++
  }

  // G20-2/G21-2: manuell gewaehlte Ziel-Kategorie je Snapshot (snapshotId → categoryId).
  // MUSS $state sein — als plain object waeren die Template-Zugriffe ({#if …}, der
  // Select-Wert) nicht reaktiv, sodass Status-Tag und Auswahl nach der Wahl nicht
  // aktualisierten (G21-2). Zuweisung per Spread, damit die Mutation getrackt wird.
  let snapCategoryChoice = $state<Record<string, string>>({})
  function setSnapCategory(id: string, categoryId: string) {
    snapCategoryChoice = { ...snapCategoryChoice, [id]: categoryId }
    // Manuelle Wahl impliziert Uebernahme → Kategorie-Checkbox aktivieren, damit
    // die Wahl beim Uebernehmen auch mitgesendet wird (sonst waere sie wirkungslos).
    const cur = snapFields[id]
    if (cur && categoryId) snapFieldOverrides[id] = { ...cur, category: true }
    catalogMirrorTick++
  }
  // Duenner Wrapper um den reinen resolveMirrorCategory-Helfer (G38, getestet):
  // reicht die einzige State-Eingabe snapCategoryChoice[id] als sessionChoice hinein.
  function snapCategoryFor(
    id: string,
    autoMatch: string | null,
    stored: string | null,
    differs = false,
    categorySource: 'off' | 'globus' | 'manual' | null = null
  ): string {
    return resolveMirrorCategory({ sessionChoice: snapCategoryChoice[id], autoMatch, stored, differs, categorySource })
  }

  // Schnell-Regel (G29): aus dem spezifischsten (letzten) Globus-Pfad-Segment +
  // der aktuell gewaehlten Kategorie eine dauerhafte 'globus'-Mapping-Regel anlegen.
  let ruleBusy = $state<string | null>(null)
  async function createRuleFromSnapshot(snapId: string, path: string[] | null, categoryId: string) {
    const token = (path && path.length > 0 ? path[path.length - 1] : '').trim()
    if (!token) { toast.error('Kein Katalog-Segment für die Regel vorhanden.'); return }
    if (!categoryId) { toast.error('Bitte zuerst eine Zielkategorie wählen.'); return }
    ruleBusy = snapId
    try {
      const res = await apiFetch('/api/category-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'globus', token, categoryId }),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(String(b?.error ?? `Fehler ${res.status}`)); return }
      toast.success(`Regel angelegt: „${token}" → Kategorie`)
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      ruleBusy = null
    }
  }

  // G34: Herkunft der Artikel-Kategorie im Spiegel zuruecksetzen (loescht die
  // manuell-Herkunft) → wieder regel-empfaenglich. Spiegel ist $derived(data),
  // daher nach invalidateAll automatisch aktuell (kein lokaler Reset-State noetig).
  let catResetBusy = $state<string | null>(null)
  async function resetCategorySource(productId: string) {
    catResetBusy = productId
    try {
      const res = await apiFetch(`/api/products/${productId}/sources?field=category`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) { toast.error(`Fehler ${res.status}`); return }
      toast.success('Kategorie-Herkunft zurückgesetzt — wieder für Regeln empfänglich')
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      catResetBusy = null
    }
  }

  async function reviewSnapshot(id: string, action: 'confirm' | 'reject', allFields = false) {
    snapshotBusy = id
    try {
      const fields = allFields
        ? { image: true, name: true, category: true, price: true, brand: true, description: true, hasDeposit: true }
        : (snapFields[id] ?? { image: true, name: false, category: false, price: false, brand: false, description: false, hasDeposit: false })
      // Nur eine MANUELLE Wahl wird als categoryId (Herkunft 'manual') gesendet. Ein
      // frischer Regel-/Auto-Vorschlag wird NICHT hier mitgegeben — der Server loest
      // ihn beim Uebernehmen selbst via matchCategoryId auf und schreibt Herkunft
      // 'globus' (Vorrang manuell > Regel > Fallback bleibt sauber, G34).
      const categoryId = mirrorSubmitCategoryId({ categorySelected: fields.category, sessionChoice: snapCategoryChoice[id] })
      const payload =
        action === 'confirm' ? { action, fields, ...(categoryId ? { categoryId } : {}) } : { action }
      const res = await apiFetch(`/api/catalog/snapshots/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const b = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(String(b?.error ?? `Fehler ${res.status}`)); return }
      toast.success(action === 'confirm' ? 'In Artikel übernommen' : 'Ignoriert')
      // Lokale Overlays dieses Snapshots verwerfen, BEVOR neu geladen wird — sonst
      // verdecken snapCategoryChoice/snapFieldOverrides die frischen data-Werte und
      // die Anzeige (Select/Tags) haengt bis zum manuellen Refresh nach (G36).
      if (snapCategoryChoice[id] !== undefined) {
        const next = { ...snapCategoryChoice }
        delete next[id]
        snapCategoryChoice = next
      }
      delete snapFieldOverrides[id]
      catalogMirrorTick++
      // Spiegel ist $derived(data) → per Reload aktualisieren.
      await invalidateAll()
    } catch {
      toast.error('Netzwerkfehler.')
    } finally {
      snapshotBusy = null
    }
  }

  // ── Category tolerance state ───────────────────────────────────────────────

  type Category = {
    id: string
    name: string
    slug: string
    icon: string | null
    parentId: string | null
    sortOrder: number
    defaultExpiryToleranceDays: number
  }

  // svelte-ignore state_referenced_locally
  let categoryRows = $state<Category[]>(data.categories as Category[])

  // Which row is being edited inline (by id)
  let editingCategoryId = $state<string | null>(null)
  // Draft value while editing
  let editingTolerance = $state(0)
  let categorySaving = $state(false)

  // ── Helpers ────────────────────────────────────────────────────────────────

  function startEditCategory(cat: Category) {
    editingCategoryId = cat.id
    editingTolerance = cat.defaultExpiryToleranceDays
  }

  function cancelEditCategory() {
    editingCategoryId = null
  }

  // ── Derived success/error from form action results ─────────────────────────

  const globalSuccess = $derived(
    form && (form as any).action === 'updateGlobalTolerance' && (form as any).success
  )
  const globalError = $derived(
    form && (form as any).action === 'updateGlobalTolerance' ? (form as any).error : null
  )
  const categoryError = $derived(
    form && (form as any).action === 'updateCategoryTolerance' ? (form as any).error : null
  )
  const priceScrapeSuccess = $derived(
    !!form && form.action === 'updatePriceScrape' && form.success === true
  )

  // ── Danger Zone: dreistufiger Werksreset (G53) ─────────────────────────────
  // Type-to-Confirm im GitHub-Stil: Modal oeffnen ist die 1. Bestaetigung, die
  // Phrase exakt eintippen die 2. Der Reset-Button bleibt disabled, bis der
  // getippte Text der Stufen-Phrase entspricht (serverseitig erneut geprueft).
  type ResetStage = 'A' | 'B' | 'C'
  const RESET_PHRASES: Record<ResetStage, string> = {
    A: 'Bestand loeschen',
    B: 'Artikel und Bestand loeschen',
    C: 'stoqr zuruecksetzen',
  }
  const RESET_META: Record<ResetStage, { title: string; button: string; scope: string[] }> = {
    A: {
      title: 'Bestand löschen',
      button: 'Alle Bestände löschen',
      scope: ['Alle Bestände (Inventar-Einträge)'],
    },
    B: {
      title: 'Artikel & Bestand löschen',
      button: 'Artikel und Bestände löschen',
      scope: [
        'Alle Bestände (Inventar-Einträge)',
        'Alle Artikel inkl. Nährwerte & Feldquellen',
        'Alle Preise & Ziel-Bestände',
      ],
    },
    C: {
      title: 'Werksreset',
      button: 'System auf Werkseinstellung zurücksetzen',
      scope: [
        'Alle Bestände, Artikel, Preise & Ziel-Bestände',
        'Einkaufslisten & Einkäufe',
        'Orte, Lager & Märkte',
        'Eigene Einheiten & Aktivitätsprotokoll',
        'Kategorien & Nährwert-Typen werden auf Werkszustand zurückgesetzt',
      ],
    },
  }

  let resetStage = $state<ResetStage | null>(null)
  let resetConfirm = $state('')
  let resetSaving = $state(false)
  const resetPhrase = $derived(resetStage ? RESET_PHRASES[resetStage] : '')
  const resetMatches = $derived(resetStage !== null && resetConfirm === resetPhrase)
  const resetError = $derived(
    form && (form as any).action === 'resetHousehold' ? (form as any).error : null
  )

  function openReset(stage: ResetStage) {
    resetStage = stage
    resetConfirm = ''
  }
  function closeReset() {
    resetStage = null
    resetConfirm = ''
  }

</script>


<div class="page">
  <header class="page-header">
    <h1 class="page-title">Einstellungen</h1>
  </header>

  <!-- ── Haushaltsmitglieder ───────────────────────────────────────────────── -->
  <!-- Nur im Pi-Target: die App hat kein Auth (Single-Household, kein Login),
       daher ist Mitglieder-Einladung/-Verwaltung dort funktionslos. Der Guard
       ist eine Compile-time-Konstante -> im Pi-Bundle bleibt die Section exakt
       erhalten (DCE), im App-Bundle wird sie entfernt. -->
  {#if __STOQR_TARGET__ !== 'app'}
    <section class="settings-section">
      <div class="section-header">
        <h2 class="section-title">Haushaltsmitglieder</h2>
        <span class="section-desc">Mitglieder einladen und verwalten</span>
      </div>
      <div class="section-body">
        <a href="/einstellungen/mitglieder" class="members-link">
          <span>Mitglieder verwalten</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </section>
  {/if}

  <!-- ── Artikel ────────────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Artikel</h2>
      <span class="section-desc">Artikel-Stammdaten anlegen und pflegen</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/artikel" class="members-link">
        <span>Artikel verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Märkte ─────────────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Märkte</h2>
      <span class="section-desc">Einkaufsmärkte verwalten und Artikeln zuordnen</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/maerkte" class="members-link">
        <span>Märkte verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Einheiten ─────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Einheiten</h2>
      <span class="section-desc">Mengeneinheiten und Umrechnung verwalten</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/einheiten" class="members-link">
        <span>Einheiten verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Kategorien ────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Kategorien</h2>
      <span class="section-desc">Artikel-Kategorien anlegen, umbenennen, löschen</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/kategorien" class="members-link">
        <span>Kategorien verwalten</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
      <a href="/einstellungen/kategorie-zuordnung" class="members-link">
        <span>Kategorie-Zuordnung (Regeln)</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Import / Export ───────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Import / Export</h2>
      <span class="section-desc">Daten als Datei sichern und zwischen Pi und App uebertragen</span>
    </div>
    <div class="section-body">
      <a href="/einstellungen/datentransfer" class="members-link">
        <span>Daten uebertragen</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <!-- ── Aktivität ─────────────────────────────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">Aktivität</h2>
      <span class="section-desc">Änderungsprotokoll — wer hat wann was geändert</span>
    </div>
    <div class="section-body">
      <a href="/aktivitaet" class="members-link">
        <span>Aktivität ansehen</span>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
    </div>
  </section>

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <circle cx="9" cy="5.5" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="9" r="1.5" fill="currentColor"/>
            <circle cx="9" cy="12.5" r="1.5" fill="currentColor"/>
          </svg>
        </span>
        MHD-Ampel Konfiguration
      </h2>
      <p class="section-desc">
        Legt fest, ab wann Artikel in der MHD-Ampel als "bald ablaufend" (gelb) oder
        "kritisch" (rot) angezeigt werden.
      </p>
    </div>

    <form
      method="POST"
      action="?/updateGlobalTolerance"
      use:enhance={() => {
        globalSaving = true
        return async ({ update }) => {
          // reset:false → SvelteKit leert die number-Inputs nicht (sonst blitzen sie leer).
          await update({ reset: false })
          // Nach invalidateAll die lokalen $state aus dem frischen data reseeden,
          // damit die gespeicherten Werte sofort durchschlagen (nicht erst nach Reload).
          yellowDays = data.expiryConfig.yellowDaysBefore
          redDays = data.expiryConfig.redDaysBefore
          graceDays = data.expiryConfig.graceDaysAfter
          globalSaving = false
        }
      }}
    >
      <div class="form-grid">
        <div class="field">
          <label class="label" for="yellow-days">
            <span class="label-dot label-dot--yellow" aria-hidden="true"></span>
            Gelb ab X Tagen vor MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="yellow-days"
              class="input input--number"
              type="number"
              name="yellow_days_before"
              min="0"
              max="365"
              bind:value={yellowDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel wird gelb markiert wenn MHD in {yellowDays} Tagen oder weniger.</p>
        </div>

        <div class="field">
          <label class="label" for="red-days">
            <span class="label-dot label-dot--red" aria-hidden="true"></span>
            Rot ab X Tagen vor MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="red-days"
              class="input input--number"
              type="number"
              name="red_days_before"
              min="0"
              max="365"
              bind:value={redDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel wird rot markiert wenn MHD in {redDays} Tagen oder weniger.</p>
        </div>

        <div class="field">
          <label class="label" for="grace-days">
            <span class="label-dot label-dot--grace" aria-hidden="true"></span>
            Gnadenfrist nach MHD
          </label>
          <div class="number-input-wrap">
            <input
              id="grace-days"
              class="input input--number"
              type="number"
              name="grace_days_after"
              min="0"
              max="365"
              bind:value={graceDays}
              required
            />
            <span class="input-suffix">Tage</span>
          </div>
          <p class="field-hint">Artikel gilt noch {graceDays} {graceDays === 1 ? 'Tag' : 'Tage'} nach MHD als verwendbar.</p>
        </div>
      </div>

      {#if globalError}
        <div class="alert alert--error" role="alert">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          {globalError}
        </div>
      {/if}

      {#if globalSuccess}
        <div class="alert alert--success" role="status">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
            <path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Ampel-Konfiguration gespeichert.
        </div>
      {/if}

      <div class="form-footer">
        <button
          class="btn-primary"
          type="submit"
          disabled={globalSaving}
        >
          {#if globalSaving}
            <span class="spinner" aria-hidden="true"></span>
            Speichern…
          {:else}
            Speichern
          {/if}
        </button>
      </div>
    </form>
  </section>

  <!-- ── Section: Online-Preis-Abruf (G4) ───────────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6.5 11.5l5-5M7 5.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M11 12.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        Online-Preis-Abruf
      </h2>
      <p class="section-desc">
        Erlaubt das automatische Abrufen von Preisen aus der Online-Suchseite eines Markts
        (DOM-Scraping, Best-Effort). Abgerufene Preise landen als Vorschlag und werden erst nach
        deiner Bestätigung maßgeblich. Standardmäßig deaktiviert.
      </p>
    </div>

    {#if __STOQR_TARGET__ === 'app'}
      <!-- App: kein Server -> Flag per apiFetch/routeApp on-device persistieren. -->
      <label class="toggle-row">
        <input
          type="checkbox"
          bind:checked={priceScrapeEnabled}
          disabled={priceScrapeSaving}
          onchange={(e) => togglePriceScrapeApp(e.currentTarget.checked)}
        />
        <span>Online-Preis-Abruf aktivieren</span>
      </label>
    {:else}
      <form
        method="POST"
        action="?/updatePriceScrape"
        use:enhance={() => {
          priceScrapeSaving = true
          return async ({ update }) => {
            await update({ reset: false })
            priceScrapeSaving = false
          }
        }}
      >
        <input type="hidden" name="enabled" value={priceScrapeEnabled ? 'true' : 'false'} />
        <label class="toggle-row">
          <input
            type="checkbox"
            bind:checked={priceScrapeEnabled}
            disabled={priceScrapeSaving}
            onchange={(e) => (e.currentTarget.closest('form') as HTMLFormElement)?.requestSubmit()}
          />
          <span>Online-Preis-Abruf aktivieren</span>
        </label>
        {#if priceScrapeSuccess}
          <p class="toggle-saved" role="status">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 8l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Gespeichert — Online-Preis-Abruf ist {priceScrapeEnabled ? 'aktiv' : 'deaktiviert'}.
          </p>
        {/if}
      </form>
    {/if}
  </section>

  <!-- ── Section: Katalog-Sicherung — EAN-Spiegel des Bestands (G10) ─────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M3 5.5C3 4 5.7 3 9 3s6 1 6 2.5M3 5.5V13c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5V5.5M3 9.25c0 1.5 2.7 2.5 6 2.5s6-1 6-2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </span>
        Katalog-Sicherung (Globus)
      </h2>
      <p class="section-desc">
        Gleicht jeden Artikel mit EAN gegen die Globus-Katalogdaten ab (Name, Kategorie, Bild).
        Abweichungen werden markiert und lassen sich einzeln oder komplett in den Artikel übernehmen.
        Voraussetzung: Online-Preis-Abruf aktiv + Markt mit Abruf-URL (mit {'{EAN}'}-Platzhalter).
      </p>
    </div>

    <div class="form-footer">
      <button class="btn-primary" type="button" disabled={syncing} onclick={runCatalogSync}>
        {#if syncing}<span class="spinner" aria-hidden="true"></span> Sichere Katalog…{:else}Katalog jetzt sichern{/if}
      </button>
    </div>

    {#if syncWarning}
      <div class="sync-warning" role="alert">
        <span class="sync-warning-icon" aria-hidden="true">⚠</span>
        <span>{syncWarning}</span>
      </div>
    {/if}

    {#if catalogMirror.length > 0}
      <div class="snap-list">
        <h3 class="snap-heading">
          Bestands-Artikel im Katalog ({catalogMirror.length})
          {#if mirrorDeviations > 0}
            <span class="snap-badge snap-badge--warn">{mirrorDeviations} abweichend</span>
          {:else}
            <span class="snap-badge">alle aktuell</span>
          {/if}
        </h3>
        {#each catalogMirror as r (r.product.id)}
          <details class="snap-item" open={r.diff.any}>
            <summary class="snap-summary">
              {#if r.snapshot?.localImagePath}
                <img class="snap-thumb" src={`/media/${r.snapshot.localImagePath}`} alt="" loading="lazy" />
              {:else if r.product.imageUrl}
                <img class="snap-thumb" src={r.product.imageUrl} alt="" loading="lazy" />
              {:else}
                <div class="snap-thumb snap-thumb--empty" aria-hidden="true"></div>
              {/if}
              <div class="snap-info">
                <span class="snap-name">{r.product.name}</span>
                <span class="snap-meta">
                  EAN {r.product.gtin}
                  {#if !r.snapshot} · (kein Katalog-Eintrag){/if}
                  {#if r.snapshot?.priceCt != null} · {fmtSnapPrice(r.snapshot.priceCt)}{/if}
                </span>
              </div>
              {#if r.diff.any}
                <span class="snap-badge snap-badge--warn">abweichend</span>
              {:else if r.snapshot}
                <span class="snap-badge">aktuell</span>
              {/if}
            </summary>

            {#if r.snapshot}
              {@const snap = r.snapshot}
              {@const catTag = mirrorCategoryTag({ sessionChoice: snapCategoryChoice[snap.id], categorySource: r.product.categorySource, differs: r.diff.category.differs, autoMatch: snap.catalogCategoryId, stored: r.product.categoryId, rawCategoryLen: snap.category?.length ?? 0 })}
              <div class="snap-diff">
                <p class="snap-diff-legend">Artikel-Wert → <strong>Globus-Katalog</strong> · abweichende Felder sind markiert; ankreuzen zum Übernehmen. <em>„Katalog sichern" holt nur neue Vorschläge — die Zuordnung (auch per Regel) greift erst beim <strong>Übernehmen</strong>.</em></p>

                <!-- Name -->
                <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.name.differs}>
                  <input type="checkbox" disabled={!snap.name} checked={snapFields[snap.id]?.name} onchange={() => toggleSnapField(snap.id, 'name')} />
                  <span class="snap-diff-field">Name {#if r.diff.name.differs}<span class="snap-diff-tag">abweichend</span>{:else}<span class="snap-diff-tag snap-diff-tag--ok">gleich</span>{/if}</span>
                  <span class="snap-diff-old">{r.product.name || '(leer)'}</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new">{snap.name || '(Katalog: kein Wert)'}</span>
                </label>

                <!-- Marke (G45) -->
                <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.brand?.differs}>
                  <input type="checkbox" disabled={!snap.brand} checked={snapFields[snap.id]?.brand} onchange={() => toggleSnapField(snap.id, 'brand')} />
                  <span class="snap-diff-field">Marke {#if r.diff.brand?.differs}<span class="snap-diff-tag">abweichend</span>{:else}<span class="snap-diff-tag snap-diff-tag--ok">gleich</span>{/if}</span>
                  <span class="snap-diff-old">{r.product.brand || '(leer)'}</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new">{snap.brand || '(Katalog: kein Wert)'}</span>
                </label>

                <!-- Beschreibung (G45) -->
                <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.description?.differs}>
                  <input type="checkbox" disabled={!snap.description} checked={snapFields[snap.id]?.description} onchange={() => toggleSnapField(snap.id, 'description')} />
                  <span class="snap-diff-field">Beschreibung {#if r.diff.description?.differs}<span class="snap-diff-tag">abweichend</span>{:else}<span class="snap-diff-tag snap-diff-tag--ok">gleich</span>{/if}</span>
                  <span class="snap-diff-old">{r.product.description || '(leer)'}</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new">{snap.description || '(Katalog: kein Wert)'}</span>
                </label>

                <!-- Pfandpflicht (G47) — nur ja/nein aus dem Katalog; Betrag pflegst du am Artikel -->
                {#if snap.hasDeposit != null}
                  <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.hasDeposit?.differs}>
                    <input type="checkbox" checked={snapFields[snap.id]?.hasDeposit} onchange={() => toggleSnapField(snap.id, 'hasDeposit')} />
                    <span class="snap-diff-field">Pfandpflicht {#if r.diff.hasDeposit?.differs}<span class="snap-diff-tag">abweichend</span>{:else}<span class="snap-diff-tag snap-diff-tag--ok">gleich</span>{/if}</span>
                    <span class="snap-diff-old">{r.product.hasDeposit ? 'ja' : 'nein'}</span>
                    <span class="snap-diff-arrow" aria-hidden="true">→</span>
                    <span class="snap-diff-new">{snap.hasDeposit ? 'ja (Betrag manuell)' : 'nein'}</span>
                  </label>
                {/if}

                <!-- Bild -->
                <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.image.differs}>
                  <input type="checkbox" disabled={!snap.localImagePath} checked={snapFields[snap.id]?.image} onchange={() => toggleSnapField(snap.id, 'image')} />
                  <span class="snap-diff-field">Bild {#if r.diff.image.differs}<span class="snap-diff-tag">abweichend</span>{:else}<span class="snap-diff-tag snap-diff-tag--ok">gleich</span>{/if}</span>
                  <span class="snap-diff-old">{r.product.imageUrl ? 'vorhanden' : '(leer)'}</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new">{snap.localImagePath ? 'Katalog-Bild' : '(Katalog: kein Bild)'}</span>
                </label>

                <!-- Kategorie: Auto-Match/Regel-Vorschlag, gespeicherte Kategorie ODER
                     manuelle Zuordnung (G20-2/G22-1/G34). -->
                <label class="snap-diff-row" class:snap-diff-row--diff={r.diff.category.differs}>
                  <input type="checkbox" disabled={!snapCategoryFor(snap.id, snap.catalogCategoryId, r.product.categoryId, r.diff.category.differs, r.product.categorySource)} checked={snapFields[snap.id]?.category} onchange={() => toggleSnapField(snap.id, 'category')} />
                  <span class="snap-diff-field">Kategorie <span class="snap-diff-tag" class:snap-diff-tag--ok={catTag.variant === 'ok'} class:snap-diff-tag--warn={catTag.variant === 'warn'}>{catTag.label}</span>{#if r.product.categorySource === 'manual'}<button class="btn-src-reset" type="button" disabled={catResetBusy === r.product.id} title="Manuelle Herkunft zurücksetzen — Kategorie bleibt, wird aber wieder für Regeln empfänglich." onclick={() => resetCategorySource(r.product.id)}>Herkunft zurücksetzen</button>{/if}</span>
                  <span class="snap-diff-old">{r.product.categoryName || '(leer)'}</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new snap-cat-pick">
                    {#if (snap.category?.length ?? 0) > 0}<span class="snap-cat-raw" title="Globus-Kategorie-Pfad">{snap.category?.join(' › ')}</span>{/if}
                    <select class="input snap-cat-select" value={snapCategoryFor(snap.id, snap.catalogCategoryId, r.product.categoryId, r.diff.category.differs, r.product.categorySource)} onchange={(e) => setSnapCategory(snap.id, e.currentTarget.value)} aria-label="Kategorie manuell zuordnen">
                      <option value="">— Kategorie wählen —</option>
                      {#each categoryTree as c (c.id)}<option value={c.id}>{catIndent(c.depth)}{c.name}</option>{/each}
                    </select>
                    {#if (snap.category?.length ?? 0) > 0 && snapCategoryFor(snap.id, snap.catalogCategoryId, r.product.categoryId, r.diff.category.differs, r.product.categorySource)}
                      <button class="btn-rule" type="button" disabled={ruleBusy === snap.id}
                        title="Dauerregel: dieses Katalog-Segment kuenftig automatisch dieser Kategorie zuordnen"
                        onclick={() => createRuleFromSnapshot(snap.id, snap.category, snapCategoryFor(snap.id, snap.catalogCategoryId, r.product.categoryId, r.diff.category.differs, r.product.categorySource))}>+ Regel</button>
                    {/if}
                  </span>
                </label>

                <!-- Preis (nur bei Markt-Bezug; als Preis-Vorschlag) -->
                <label class="snap-diff-row" class:snap-diff-row--diff={canTakePrice(r)}>
                  <input type="checkbox" disabled={!canTakePrice(r)} checked={snapFields[snap.id]?.price} onchange={() => toggleSnapField(snap.id, 'price')} />
                  <span class="snap-diff-field">Preis</span>
                  <span class="snap-diff-old">Markt-Preis</span>
                  <span class="snap-diff-arrow" aria-hidden="true">→</span>
                  <span class="snap-diff-new">{snap.priceCt != null ? fmtSnapPrice(snap.priceCt) + ' (Vorschlag)' : '(Katalog: kein Preis)'}</span>
                </label>

                {#if snap.extracted && snap.extracted.length > 0}
                  <details class="field-map">
                    <summary>Abgerufene Felder ({snap.extracted.length}) — Herkunft &amp; Zugehörigkeit</summary>
                    <table class="field-map-table">
                      <thead><tr><th>Feld</th><th>Wert</th><th>Quelle</th><th>gehört zu</th></tr></thead>
                      <tbody>
                        {#each snap.extracted as e (e.field)}
                          <tr>
                            <td>{e.field}</td>
                            <td class="field-map-val">{e.value}</td>
                            <td><span class="field-map-src">{e.source}</span></td>
                            <td>{e.belongsTo === 'article' ? 'Artikel' : e.belongsTo === 'price' ? 'Preis' : 'Markt'}</td>
                          </tr>
                        {/each}
                      </tbody>
                    </table>
                  </details>
                {/if}

                <div class="snap-actions">
                  <button class="btn-save-inline" type="button" disabled={snapshotBusy === snap.id} onclick={() => reviewSnapshot(snap.id, 'confirm')}>Übernehmen</button>
                  <button class="btn-save-inline" type="button" disabled={snapshotBusy === snap.id} onclick={() => reviewSnapshot(snap.id, 'confirm', true)}>Alles übernehmen</button>
                  <button class="btn-cancel-inline" type="button" disabled={snapshotBusy === snap.id} onclick={() => reviewSnapshot(snap.id, 'reject')}>Ignorieren</button>
                </div>
              </div>
            {:else}
              <div class="snap-diff snap-diff--ok">Noch kein Katalog-Eintrag — „Katalog jetzt sichern" ausführen.</div>
            {/if}
          </details>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ── Section 2: MHD-Toleranz nach Kategorie ─────────────────────────── -->

  <section class="settings-section">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="10" y="2.5" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="2.5" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
            <rect x="10" y="10" width="5.5" height="5.5" rx="1.5" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </span>
        MHD-Toleranz nach Kategorie
      </h2>
      <p class="section-desc">
        Pro Kategorie kann ein Toleranz-Offset gesetzt werden.
        <strong>Positive Werte</strong> bedeuten: Artikel ist noch verwendbar X Tage nach MHD
        (z.B. Konserven +180). <strong>Negative Werte</strong> bedeuten: Artikel schon X Tage
        vor MHD als abgelaufen behandeln (z.B. Frischfleisch -1).
      </p>
    </div>

    {#if categoryError}
      <div class="alert alert--error" role="alert">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5"/>
          <path d="M8 5v3.5M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        {categoryError}
      </div>
    {/if}

    {#if categoryRows.length === 0}
      <div class="empty-hint">Keine Kategorien vorhanden.</div>
    {:else}
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th class="th">Kategorie</th>
              <th class="th th--center">Toleranz-Tage</th>
              <th class="th th--right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {#each categoryRows as cat (cat.id)}
              <tr class="tr" class:tr--editing={editingCategoryId === cat.id}>
                <td class="td">
                  <span class="cat-name">
                    {#if cat.icon}
                      <span class="cat-icon" aria-hidden="true">{cat.icon}</span>
                    {/if}
                    {cat.name}
                  </span>
                </td>

                <td class="td td--center">
                  {#if editingCategoryId === cat.id}
                    <input
                      class="input input--inline-number"
                      type="number"
                      min="-365"
                      max="365"
                      bind:value={editingTolerance}
                      aria-label="Toleranz-Tage für {cat.name}"
                    />
                  {:else}
                    <span
                      class="tolerance-value"
                      class:tolerance-value--positive={cat.defaultExpiryToleranceDays > 0}
                      class:tolerance-value--negative={cat.defaultExpiryToleranceDays < 0}
                    >
                      {cat.defaultExpiryToleranceDays > 0 ? '+' : ''}{cat.defaultExpiryToleranceDays}
                    </span>
                  {/if}
                </td>

                <td class="td td--right">
                  {#if editingCategoryId === cat.id}
                    <div class="action-row">
                      <form
                        method="POST"
                        action="?/updateCategoryTolerance"
                        use:enhance={() => {
                          categorySaving = true
                          return async ({ result, update }) => {
                            await update({ reset: false })
                            categorySaving = false
                            if (result.type === 'success') {
                              // Patch local state
                              categoryRows = categoryRows.map((c) =>
                                c.id === cat.id
                                  ? { ...c, defaultExpiryToleranceDays: editingTolerance }
                                  : c
                              )
                              editingCategoryId = null
                            }
                          }
                        }}
                      >
                        <input type="hidden" name="category_id" value={cat.id} />
                        <input type="hidden" name="tolerance_days" value={editingTolerance} />
                        <button
                          class="btn-save-inline"
                          type="submit"
                          disabled={categorySaving}
                          aria-label="Speichern"
                        >
                          {#if categorySaving}
                            <span class="spinner spinner--sm" aria-hidden="true"></span>
                          {:else}
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                              <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                          {/if}
                          Speichern
                        </button>
                      </form>
                      <button
                        class="btn-cancel-inline"
                        type="button"
                        onclick={cancelEditCategory}
                        aria-label="Abbrechen"
                      >
                        Abbrechen
                      </button>
                    </div>
                  {:else}
                    <button
                      class="btn-edit-inline"
                      type="button"
                      onclick={() => startEditCategory(cat)}
                      aria-label="Toleranz für {cat.name} bearbeiten"
                    >
                      <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                        <path d="M9.5 2.5L11.5 4.5L5 11H3V9L9.5 2.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
                      </svg>
                      Bearbeiten
                    </button>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>

  <!-- ── Section 4: Bring! Integration (Placeholder) ───────────────────── -->

  <section class="settings-section settings-section--disabled">
    <div class="section-header">
      <h2 class="section-title">
        <span class="section-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M6 9h6M9 6l3 3-3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        Bring! Integration
        <span class="coming-soon-badge">Kommt in Phase 3</span>
      </h2>
      <p class="section-desc">
        Verbinde stoqr mit deiner Bring!-Einkaufsliste. Abgelaufene oder verbrauchte Artikel
        werden automatisch auf die Einkaufsliste gesetzt.
      </p>
    </div>

    <div class="form-grid">
      <div class="field">
        <label class="label label--disabled" for="bring-email">Bring! E-Mail</label>
        <input
          id="bring-email"
          class="input input--disabled"
          type="email"
          placeholder="deine@email.de"
          disabled
          autocomplete="off"
        />
      </div>

      <div class="field">
        <label class="label label--disabled" for="bring-password">Bring! Passwort</label>
        <input
          id="bring-password"
          class="input input--disabled"
          type="password"
          placeholder="••••••••"
          disabled
          autocomplete="off"
        />
      </div>
    </div>

    <div class="form-footer">
      <button class="btn-primary btn-primary--disabled" type="button" disabled>
        Verbinden
      </button>
    </div>
  </section>

  <!-- ── Sync: waehlbares fuehrendes System (Phase-1-Stub) ─────────────────── -->

  <SyncSettings />

  <!-- ── Danger Zone: Werksreset (G53) ─────────────────────────────────────── -->

  <section class="settings-section settings-section--danger">
    <div class="section-header">
      <h2 class="section-title">Gefahrenzone</h2>
      <span class="section-desc">
        Unwiderrufliche Aktionen. Löscht Bestand und setzt das System zurück.
      </span>
    </div>
    <div class="danger-actions">
      <div class="danger-row">
        <div class="danger-text">
          <span class="danger-title">Bestand löschen</span>
          <span class="danger-desc">Entfernt alle Bestände. Artikel, Orte und Märkte bleiben erhalten.</span>
        </div>
        <button class="btn-danger" type="button" onclick={() => openReset('A')}>Löschen</button>
      </div>
      <div class="danger-row">
        <div class="danger-text">
          <span class="danger-title">Artikel & Bestand löschen</span>
          <span class="danger-desc">Zusätzlich zu den Beständen auch alle Artikel und Preise.</span>
        </div>
        <button class="btn-danger" type="button" onclick={() => openReset('B')}>Löschen</button>
      </div>
      <div class="danger-row">
        <div class="danger-text">
          <span class="danger-title">Werksreset</span>
          <span class="danger-desc">Setzt das System vollständig zurück. Nutzer & Haushalt bleiben.</span>
        </div>
        <button class="btn-danger" type="button" onclick={() => openReset('C')}>Zurücksetzen</button>
      </div>
    </div>
  </section>
</div>

<!-- Type-to-Confirm-Modal fuer den Werksreset -->
{#if resetStage}
  <Modal open={true} title={RESET_META[resetStage].title} size="sm" onClose={closeReset}>
    <p class="reset-warn">
      <strong>Diese Aktion kann nicht rückgängig gemacht werden.</strong>
      Folgendes wird dauerhaft gelöscht:
    </p>
    <ul class="reset-scope">
      {#each RESET_META[resetStage].scope as line}
        <li>{line}</li>
      {/each}
    </ul>
    <form
      id="reset-form"
      method="POST"
      action="?/resetHousehold"
      use:enhance={() => {
        resetSaving = true
        return async ({ update, result }) => {
          await update({ reset: false })
          resetSaving = false
          if (result.type === 'success') {
            await invalidateAll()
            const doneStage = resetStage
            closeReset()
            toast.success(
              doneStage === 'C'
                ? 'System auf Werkszustand zurückgesetzt. Kategorien & Nährwerte sind wieder da.'
                : 'Löschung abgeschlossen.'
            )
          }
        }
      }}
    >
      <input type="hidden" name="stage" value={resetStage} />
      <label class="reset-label" for="reset-confirm">
        Zum Bestätigen exakt eintippen: <code class="reset-phrase">{resetPhrase}</code>
      </label>
      <input
        id="reset-confirm"
        class="input reset-input"
        type="text"
        name="confirm"
        bind:value={resetConfirm}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder={resetPhrase}
      />
      {#if resetError}
        <p class="reset-alert">{resetError}</p>
      {/if}
    </form>
    {#snippet footer()}
      <button class="btn-cancel" type="button" onclick={closeReset}>Abbrechen</button>
      <button
        class="btn-danger"
        type="submit"
        form="reset-form"
        disabled={!resetMatches || resetSaving}
      >
        {resetSaving ? 'Wird gelöscht…' : (resetStage ? RESET_META[resetStage].button : '')}
      </button>
    {/snippet}
  </Modal>
{/if}

<style>
  /* ── Page ─────────────────────────────────────────────────────────────── */

  .page {
    max-width: 760px;
    margin: 0 auto;
    padding: var(--space-8) var(--space-6) var(--space-16);
  }

  .page-header {
    margin-bottom: var(--space-8);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
    margin: 0;
  }

  /* ── Section ──────────────────────────────────────────────────────────── */

  .settings-section {
    background-color: var(--color-surface-raised);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--space-6);
    margin-bottom: var(--space-6);
    box-shadow: var(--shadow-sm);
  }

  .settings-section--disabled {
    opacity: 0.6;
  }

  /* ── Danger Zone (G53) ─────────────────────────────────────────────────── */

  .settings-section--danger {
    border-color: color-mix(in srgb, var(--color-danger, #dc2626) 40%, var(--color-border));
  }

  .danger-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .danger-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-border-subtle);
  }
  .danger-row:first-child {
    border-top: none;
  }

  .danger-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .danger-title {
    font-weight: 600;
    color: var(--color-text-primary);
  }
  .danger-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .btn-danger {
    flex-shrink: 0;
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-danger, #dc2626);
    background: var(--color-danger, #dc2626);
    color: #fff;
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast), opacity var(--transition-fast);
  }
  .btn-danger:hover:not(:disabled) {
    background: #901c12;
    border-color: #901c12;
  }
  .btn-danger:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-cancel {
    padding: var(--space-2) var(--space-4);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    border-radius: var(--radius-md);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--transition-fast);
  }
  .btn-cancel:hover {
    background: var(--color-surface-sunken);
  }

  .reset-warn {
    margin: 0 0 var(--space-3);
    color: var(--color-text-primary);
    line-height: 1.5;
  }
  .reset-scope {
    margin: 0 0 var(--space-4);
    padding-left: var(--space-5);
    color: var(--color-text-secondary);
    font-size: var(--text-sm);
    line-height: 1.6;
  }
  .reset-label {
    display: block;
    margin-bottom: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }
  .reset-phrase {
    font-family: var(--font-mono, monospace);
    background: var(--color-surface-sunken);
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    color: var(--color-danger, #dc2626);
    user-select: all;
  }
  .reset-input {
    width: 100%;
  }
  .reset-alert {
    margin: var(--space-3) 0 0;
    font-size: var(--text-sm);
    color: var(--color-danger, #dc2626);
  }

  .section-header {
    margin-bottom: var(--space-6);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 0 0 var(--space-2);
    flex-wrap: wrap;
  }

  .section-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-md);
    background-color: var(--color-primary-subtle);
    color: var(--color-primary);
    flex-shrink: 0;
  }

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
    margin: 0;
    line-height: 1.6;
  }

  /* ── Katalog-Snapshots (G7) ───────────────────────────────────────────── */
  .snap-list { margin-top: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); }
  .snap-heading { font-size: var(--text-sm); font-weight: 700; color: var(--color-text-primary); margin: 0 0 var(--space-1); display: flex; align-items: center; gap: var(--space-2); }
  .snap-item { display: block; padding: 0; border: 1px solid var(--color-border); border-radius: var(--radius-md); overflow: hidden; }
  .snap-summary { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-3); cursor: pointer; list-style: none; }
  .snap-summary::-webkit-details-marker { display: none; }
  .snap-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: var(--radius-sm); flex-shrink: 0; background: var(--color-surface-sunken); }
  .snap-thumb--empty { border: 1px dashed var(--color-border); }
  .snap-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .snap-name { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-primary); }
  .snap-meta { font-size: var(--text-xs); color: var(--color-text-muted); }
  .snap-actions { display: flex; gap: var(--space-2); flex-shrink: 0; flex-wrap: wrap; margin-top: var(--space-2); }

  /* Feld-Landkarte (G44): woher kam welcher abgerufene Wert */
  .field-map { margin-top: var(--space-2); font-size: var(--text-xs); }
  .field-map summary { cursor: pointer; color: var(--color-text-secondary); font-weight: 600; }
  .field-map summary:hover { color: var(--color-text-primary); }
  .field-map-table { width: 100%; border-collapse: collapse; margin-top: var(--space-2); }
  .field-map-table th { text-align: left; color: var(--color-text-muted); font-weight: 600; padding: 2px var(--space-2); border-bottom: 1px solid var(--color-border); }
  .field-map-table td { padding: 2px var(--space-2); border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); vertical-align: top; }
  .field-map-val { color: var(--color-text-primary); word-break: break-word; }
  .field-map-src { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--color-text-muted); }
  .snap-badge { font-size: var(--text-xs); font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--color-surface-sunken); color: var(--color-text-muted); flex-shrink: 0; }
  .snap-badge--warn { background: color-mix(in srgb, var(--color-warning, #d97706) 18%, transparent); color: var(--color-warning, #d97706); }
  .snap-diff { padding: var(--space-2) var(--space-3) var(--space-3); border-top: 1px solid var(--color-border); display: flex; flex-direction: column; gap: var(--space-2); }
  .snap-diff--ok { font-size: var(--text-xs); color: var(--color-text-muted); }
  .snap-diff-row { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-xs); cursor: pointer; flex-wrap: wrap; opacity: 0.7; }
  .snap-diff-row--diff { opacity: 1; }
  .snap-diff-row input { accent-color: var(--color-primary); }
  .snap-diff-row input:disabled { cursor: not-allowed; }
  .snap-diff-field { font-weight: 600; color: var(--color-text-primary); min-width: 68px; display: inline-flex; align-items: center; gap: 4px; }
  .snap-diff-tag { font-size: 9px; font-weight: 700; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--color-warning, #d97706) 18%, transparent); color: var(--color-warning, #d97706); text-transform: uppercase; letter-spacing: 0.03em; }
  .snap-diff-tag--ok { background: var(--color-surface-sunken); color: var(--color-text-muted); }
  .snap-diff-tag--warn { background: color-mix(in srgb, var(--color-danger, #dc2626) 16%, transparent); color: var(--color-danger, #dc2626); }
  .snap-cat-pick { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .snap-cat-raw { color: var(--color-text-muted); font-size: var(--text-xs); }
  .snap-cat-select { height: 28px; padding: 0 6px; font-size: var(--text-xs); min-width: 150px; }
  .btn-rule { height: 28px; padding: 0 8px; border-radius: var(--radius-md); border: 1px solid var(--color-border); background: transparent; color: var(--color-primary); font-size: var(--text-xs); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-src-reset { margin-left: var(--space-2); padding: 0 6px; height: 18px; border: 1px solid var(--color-border); border-radius: var(--radius-full); background: transparent; color: var(--color-primary); font-size: 10px; font-weight: 600; cursor: pointer; white-space: nowrap; }
  .btn-src-reset:hover:not(:disabled) { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .btn-src-reset:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn-rule:hover:not(:disabled) { border-color: var(--color-primary); background: var(--color-primary-subtle); }
  .btn-rule:disabled { opacity: 0.5; cursor: not-allowed; }
  .snap-diff-old { color: var(--color-text-muted); }
  .snap-diff-row--diff .snap-diff-old { text-decoration: line-through; }
  .snap-diff-arrow { color: var(--color-text-muted); }
  .snap-diff-new { color: var(--color-text-primary); font-weight: 500; }
  .snap-diff-legend { font-size: var(--text-xs); color: var(--color-text-muted); margin: 0 0 var(--space-1); }
  .sync-warning { margin-top: var(--space-4); display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-3); border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-warning, #d97706) 12%, transparent); border: 1px solid color-mix(in srgb, var(--color-warning, #d97706) 40%, transparent); color: var(--color-text-primary); font-size: var(--text-sm); }
  .sync-warning-icon { font-size: 1.1em; line-height: 1; flex-shrink: 0; }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--color-text-primary);
    cursor: pointer;
  }
  .toggle-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--color-primary);
    cursor: pointer;
  }
  .toggle-saved {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--color-success, #16a34a);
    margin: var(--space-3) 0 0;
  }
  /* ── Coming-soon badge ────────────────────────────────────────────────── */

  .coming-soon-badge {
    display: inline-flex;
    align-items: center;
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    background-color: var(--color-accent-subtle);
    color: var(--color-accent);
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.01em;
    white-space: nowrap;
  }

  /* ── Form grid ────────────────────────────────────────────────────────── */

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--space-5);
    margin-bottom: var(--space-5);
  }

  .form-footer {
    display: flex;
    justify-content: flex-end;
  }

  /* ── Field ────────────────────────────────────────────────────────────── */

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .label--disabled {
    color: var(--color-text-muted);
  }

  .label-dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .label-dot--yellow { background-color: #ca8a04; }
  .label-dot--red    { background-color: var(--color-danger, #dc2626); }
  .label-dot--grace  { background-color: var(--color-success, #16a34a); }

  .field-hint {
    font-size: var(--text-xs);
    color: var(--color-text-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* ── Inputs ───────────────────────────────────────────────────────────── */

  .input {
    height: 40px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-body);
    font-size: var(--text-base);
    outline: none;
    transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
    width: 100%;
    box-sizing: border-box;
    appearance: none;
  }

  .input::placeholder {
    color: var(--color-text-muted);
  }

  .input:focus {
    border-color: var(--color-border-focus);
    box-shadow: 0 0 0 3px rgba(196, 103, 58, 0.15);
  }

  .input--disabled {
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
    cursor: not-allowed;
  }

  .input--number {
    max-width: 120px;
  }

  .input--inline-number {
    height: 32px;
    width: 80px;
    font-size: var(--text-sm);
    text-align: center;
  }

  .number-input-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .input-suffix {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    white-space: nowrap;
  }

  /* ── Alerts ───────────────────────────────────────────────────────────── */

  .alert {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
    font-weight: 500;
    margin-bottom: var(--space-4);
  }

  .alert--error {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
    border: 1px solid rgba(220, 38, 38, 0.2);
  }

  .alert--success {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
    border: 1px solid rgba(22, 163, 74, 0.2);
  }

  /* ── Buttons ──────────────────────────────────────────────────────────── */

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 40px;
    padding: 0 var(--space-5);
    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast), box-shadow var(--transition-fast);
  }

  .btn-primary:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-md);
  }

  .btn-primary:disabled,
  .btn-primary--disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  /* ── Table ────────────────────────────────────────────────────────────── */

  .table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border);
  }

  .table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .th {
    padding: var(--space-3) var(--space-4);
    background-color: var(--color-surface-sunken);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    white-space: nowrap;
  }

  .th--center { text-align: center; }
  .th--right  { text-align: right; }

  .tr {
    border-bottom: 1px solid var(--color-border-subtle);
    transition: background-color var(--transition-fast);
  }

  .tr:last-child {
    border-bottom: none;
  }

  .tr:hover {
    background-color: var(--color-surface-sunken);
  }

  .tr--editing {
    background-color: var(--color-primary-subtle);
  }

  .td {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text-primary);
    vertical-align: middle;
  }

  .td--center { text-align: center; }
  .td--right  { text-align: right; }

  /* ── Category name cell ───────────────────────────────────────────────── */

  .cat-name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-weight: 500;
  }

  .cat-icon {
    font-size: 1rem;
    line-height: 1;
    flex-shrink: 0;
  }

  /* ── Tolerance value display ──────────────────────────────────────────── */

  .tolerance-value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 48px;
    height: 24px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 700;
    background-color: var(--color-surface-sunken);
    color: var(--color-text-muted);
  }

  .tolerance-value--positive {
    background-color: var(--color-success-subtle, #dcfce7);
    color: var(--color-success, #16a34a);
  }

  .tolerance-value--negative {
    background-color: var(--color-danger-subtle, #fee2e2);
    color: var(--color-danger, #dc2626);
  }

  /* ── Inline edit actions ──────────────────────────────────────────────── */

  .action-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    flex-wrap: wrap;
  }

  .btn-edit-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-secondary);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .btn-edit-inline:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
    background-color: var(--color-primary-subtle);
  }

  .btn-save-inline {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 30px;
    padding: 0 var(--space-3);    border-radius: var(--radius-md);
    border: none;
    background-color: var(--color-primary);
    color: var(--color-text-inverse);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background-color var(--transition-fast);
  }

  .btn-save-inline:hover:not(:disabled) {
    background-color: var(--color-primary-hover);
  }

  .btn-save-inline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-cancel-inline {
    display: inline-flex;
    align-items: center;
    height: 30px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-md);
    border: 1px solid var(--color-border);
    background-color: transparent;
    color: var(--color-text-muted);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: border-color var(--transition-fast), color var(--transition-fast);
  }

  .btn-cancel-inline:hover {
    border-color: var(--color-border-strong);
    color: var(--color-text-primary);
  }

  /* ── Empty hint ───────────────────────────────────────────────────────── */

  .empty-hint {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    padding: var(--space-4) 0;
  }

  /* ── Spinner ──────────────────────────────────────────────────────────── */

  .spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 600ms linear infinite;
    flex-shrink: 0;
  }

  .spinner--sm {
    width: 11px;
    height: 11px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ── Responsive ───────────────────────────────────────────────────────── */

  @media (max-width: 560px) {
    .page {
      padding: var(--space-5) var(--space-3) var(--space-12);
    }

    .settings-section {
      padding: var(--space-4);
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    .form-footer {
      justify-content: stretch;
    }

    .btn-primary {
      width: 100%;
      justify-content: center;
    }

    .action-row {
      gap: var(--space-1);
    }

    /* Increase inline button touch targets for mobile */
    .btn-edit-inline,
    .btn-save-inline,
    .btn-cancel-inline {
      height: 44px;
      padding: 0 var(--space-4);
    }

    /* Unit edit/delete icon buttons — increase tap area */
  }

  .members-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--color-primary);
    text-decoration: none;
    font-weight: 500;
    font-size: var(--text-base);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    transition: background var(--transition-fast), border-color var(--transition-fast);
  }
  .members-link:hover {
    background: var(--color-primary-subtle);
    border-color: var(--color-primary);
  }

  .section-desc {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
    margin-top: var(--space-1);
    display: block;
  }
</style>
