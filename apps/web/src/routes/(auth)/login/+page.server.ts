import { redirect } from '@sveltejs/kit'
import { AUTH_DISABLED } from '$lib/server/auth-bypass'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  // Login deaktiviert: die tote Login-Seite gar nicht erst anzeigen.
  if (AUTH_DISABLED) {
    redirect(302, '/')
  }
  if (locals.user) {
    redirect(302, '/')
  }
  return {}
}
