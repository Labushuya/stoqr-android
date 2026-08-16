import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: Login existiert nicht (lokale Identitaet ist immer vorhanden).
    // Direkt aufs Dashboard umleiten — kein DB-Zugriff. redirect() wirft, muss
    // daher VOR jedem return stehen.
    const { redirect } = await import('@sveltejs/kit')
    redirect(302, '/')
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
