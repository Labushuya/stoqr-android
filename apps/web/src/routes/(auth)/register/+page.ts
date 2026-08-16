import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target: keine Registrierung — die lokale Identitaet existiert immer.
    // redirect wirft, daher kein return danach. Kein DB-Zugriff.
    const { redirect } = await import('@sveltejs/kit')
    redirect(302, '/')
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle (isFirstUser, token, ...).
  // Leeres Objekt merged, laesst die Server-Daten intakt.
  return {}
}
