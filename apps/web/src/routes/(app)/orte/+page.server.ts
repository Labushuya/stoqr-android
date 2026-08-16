import { getLocations } from '$lib/server/queries/locations'
import { requireHouseholdId } from '$lib/server/queries/households'
import { redirect } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) redirect(302, '/login')
  const householdId = await requireHouseholdId(locals.user.id)
  const locations = await getLocations(householdId)
  return { locations }
}
