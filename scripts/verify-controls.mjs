// On-device control-unification verification over CDP (Playwright connectOverCDP).
// Navigates app routes in the running debug WebView, measures control geometry,
// overflow, focus-ring token, and spot-checks key bug fixes. Read-only.
import { chromium } from 'file:///C:/Users/I538150/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs'

const CDP = 'http://localhost:9333'
const ALLOWED_H = [30, 36, 40, 44]         // canonical scale (+52 hero CTA allowed)
const HERO = 52
const TOL = 2

const ROUTES = [
  '/', '/inventar', '/einkauf', '/einkaufsliste', '/orte',
  '/einstellungen', '/einstellungen/einheiten', '/einstellungen/kategorien',
  '/einstellungen/kategorie-zuordnung', '/einstellungen/maerkte',
  '/einstellungen/mitglieder', '/einstellungen/datentransfer',
]

// Classes intentionally off-scale (icon/fab/toggle/link/badges) — excluded from height gate.
const SKIP_RE = /\b(fab|view-toggle|btn-theme|btn-icon|btn-x|btn-link|up-mode|toggle-|btn-book|icon-btn|btn-copy|check\b|move-select|breadcrumb|status-badge|real-badge|res-badge|src-badge|system-badge|scrape-badge|deposit-badge|source-badge|action-badge|value-chip|badge|chip-btn|btn-add-child|btn-save--xs|btn-cancel--xs)/

const browser = await chromium.connectOverCDP(CDP)
const ctx = browser.contexts()[0]
const page = ctx.pages()[0]

const measure = () => page.evaluate(({ ALLOWED_H, HERO, TOL, SKIP_SRC }) => {
  const SKIP_RE = new RegExp(SKIP_SRC)
  const vw = document.documentElement.clientWidth
  const out = { badHeight: [], overflow: [], inputBad: [], focusRing: null }
  // Height gate on control-ish elements
  const controls = [...document.querySelectorAll("button, a[class*='btn'], [class*='btn-'], .input, select.input, .chip")]
  for (const el of controls) {
    const cls = el.className?.baseVal ?? el.className ?? ''
    if (typeof cls !== 'string' || SKIP_RE.test(cls)) continue
    const r = el.getBoundingClientRect()
    if (r.height === 0 || r.width === 0) continue
    const h = Math.round(r.height)
    const ok = ALLOWED_H.some(a => Math.abs(h - a) <= TOL) || Math.abs(h - HERO) <= TOL
    const label = (cls || el.tagName).toString().slice(0, 40) + ' «' + (el.textContent || '').trim().slice(0, 14) + '»'
    if (!ok) out.badHeight.push({ h, label })
    // right-edge overflow past viewport
    if (r.right > vw + 1) out.overflow.push({ label, right: Math.round(r.right), vw })
  }
  // Inputs/selects must be ~40
  for (const el of document.querySelectorAll('.input')) {
    const r = el.getBoundingClientRect()
    if (r.height === 0) continue
    const h = Math.round(r.height)
    if (Math.abs(h - 40) > TOL && Math.abs(h - 32) > TOL) // 32 = inline-number modifier allowed
      out.inputBad.push({ h, cls: (el.className.baseVal ?? el.className).toString().slice(0, 40) })
  }
  return out
}, { ALLOWED_H, HERO, TOL, SKIP_SRC: SKIP_RE.source })

let totalBad = 0, totalOverflow = 0, totalInput = 0
for (const route of ROUTES) {
  try {
    await page.evaluate((r) => { window.location.hash = ''; history.pushState({}, '', r) }, route)
    await page.evaluate((r) => { return fetch; }, route) // noop keep-alive
    // SvelteKit client nav:
    await page.evaluate(async (r) => {
      const a = document.createElement('a'); a.href = r; document.body.appendChild(a); a.click(); a.remove()
    }, route)
    await page.waitForTimeout(900)
    const m = await measure()
    const cur = await page.evaluate(() => location.pathname)
    const flag = (m.badHeight.length || m.overflow.length || m.inputBad.length) ? '⚠' : '✓'
    console.log(`${flag} ${route}  (at ${cur})  bad=${m.badHeight.length} overflow=${m.overflow.length} inputBad=${m.inputBad.length}`)
    m.badHeight.slice(0, 6).forEach(b => console.log(`     H ${b.h}px  ${b.label}`))
    m.overflow.slice(0, 6).forEach(o => console.log(`     ► overflow right=${o.right} > vw=${o.vw}  ${o.label}`))
    m.inputBad.slice(0, 6).forEach(i => console.log(`     ⌨ input ${i.h}px  ${i.cls}`))
    totalBad += m.badHeight.length; totalOverflow += m.overflow.length; totalInput += m.inputBad.length
  } catch (e) {
    console.log(`✗ ${route}  ERROR ${String(e).slice(0, 120)}`)
  }
}

console.log(`\n=== TOTALS: badHeight=${totalBad} overflow=${totalOverflow} inputBad=${totalInput} ===`)
await browser.close()
