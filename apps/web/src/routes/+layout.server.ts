import { AUTH_DISABLED } from '$lib/server/auth-bypass'
import type { LayoutServerLoad } from './$types'

export const load: LayoutServerLoad = async ({ locals, depends }) => {
  depends('app:user')
  return {
    user: locals.user ?? null,
    authDisabled: AUTH_DISABLED,
  }
}
