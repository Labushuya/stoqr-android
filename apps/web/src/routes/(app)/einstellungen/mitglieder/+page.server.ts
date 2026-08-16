import { redirect, fail } from '@sveltejs/kit'
import { getDb } from '$lib/server/db'
import { householdMembers } from '@stoqr/db'
import {
  requireHouseholdId,
  getHouseholdRole,
  getHouseholdMembers,
  createInvite,
} from '$lib/server/queries/households'
import { eq, and } from 'drizzle-orm'
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals }) => {
  const db = getDb()
  if (!locals.user) redirect(302, '/login')

  const userId = locals.user.id
  const householdId = await requireHouseholdId(userId)
  const role = await getHouseholdRole(userId)
  const members = await getHouseholdMembers(householdId)

  // Open (unused, non-expired) invites
  const now = new Date()
  const openInvites = await db.query.invites.findMany({
    where: (inv: any, { eq, isNull, gt, and }: any) =>
      and(eq(inv.householdId, householdId), isNull(inv.usedAt), gt(inv.expiresAt, now)),
    orderBy: (inv: any, { desc }: any) => [desc(inv.expiresAt)],
  })

  return {
    members,
    openInvites,
    role,
    currentUserId: userId,
    householdId,
  }
}

export const actions: Actions = {
  invite: async ({ locals, request, url }) => {
    if (!locals.user) redirect(302, '/login')

    const userId = locals.user.id
    const householdId = await requireHouseholdId(userId)
    const role = await getHouseholdRole(userId)

    if (role !== 'admin') {
      return fail(403, { action: 'invite', error: 'Nur Admins können Einladungen erstellen.' })
    }

    const data = await request.formData()
    const email = String(data.get('email') ?? '').trim().toLowerCase()

    if (!email || !email.includes('@')) {
      return fail(400, { action: 'invite', error: 'Bitte eine gültige E-Mail-Adresse eingeben.' })
    }

    const { token } = await createInvite(householdId, email, userId)

    return {
      action: 'invite',
      success: true,
      inviteLink: url.origin + '/register?token=' + token,
    }
  },

  removeMember: async ({ locals, request }) => {
    const db = getDb()
    if (!locals.user) redirect(302, '/login')

    const userId = locals.user.id
    const householdId = await requireHouseholdId(userId)
    const role = await getHouseholdRole(userId)

    if (role !== 'admin') {
      return fail(403, { action: 'removeMember', error: 'Nur Admins können Mitglieder entfernen.' })
    }

    const data = await request.formData()
    const targetUserId = String(data.get('userId') ?? '').trim()

    if (!targetUserId) {
      return fail(400, { action: 'removeMember', error: 'Ungültige Anfrage.' })
    }

    if (targetUserId === userId) {
      return fail(400, { action: 'removeMember', error: 'Du kannst dich nicht selbst entfernen.' })
    }

    await db
      .delete(householdMembers)
      .where(
        and(
          eq(householdMembers.userId, targetUserId),
          eq(householdMembers.householdId, householdId)
        )
      )

    return { action: 'removeMember', success: true }
  },
}
