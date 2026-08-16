import { getDashboardStats, getExpiringItems, getExpiredItems } from '$lib/server/queries/dashboard'
import { requireHouseholdId } from '$lib/server/queries/households'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  const [stats, expiringSoon, expired] = await Promise.all([
    getDashboardStats(householdId),
    getExpiringItems(householdId, 14),
    getExpiredItems(householdId),
  ])
  return { stats, expiringSoon, expired }
}
