import { getDb } from '$lib/server/db'
import { users, invites, householdMembers } from '@stoqr/db'
import { auth } from '$lib/server/auth'
import { createHousehold, getInviteByToken } from '$lib/server/queries/households'
import { eq, sql } from 'drizzle-orm'
import { fail, redirect } from '@sveltejs/kit'
import type { PageServerLoad, Actions } from './$types'

export const load: PageServerLoad = async ({ locals, url }) => {
  const db = getDb()
  if (locals.user) {
    redirect(302, '/')
  }

  // Check whether any users exist so we can guide the UI
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(users)
  const isFirstUser = count === 0

  const token = url.searchParams.get('token')
  if (!token) {
    return { isFirstUser }
  }

  const invite = await getInviteByToken(token)
  const now = new Date()

  if (!invite || invite.usedAt !== null || invite.expiresAt <= now) {
    return { isFirstUser, tokenInvalid: true }
  }

  return { isFirstUser, token, inviteEmail: invite.email }
}

export const actions: Actions = {
  register: async ({ request }) => {
    const db = getDb()
    const data = await request.formData()
    const name = String(data.get('name') ?? '').trim()
    const email = String(data.get('email') ?? '').trim()
    const password = String(data.get('password') ?? '')
    const token = String(data.get('token') ?? '').trim()

    // Validate required fields
    if (!name || !email || !password) {
      return fail(400, { error: 'Alle Felder sind erforderlich.' })
    }
    if (password.length < 8) {
      return fail(400, { error: 'Das Passwort muss mindestens 8 Zeichen lang sein.' })
    }

    // Count existing users
    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)

    const isFirst = count === 0

    // If not first user, require a valid token
    if (!isFirst) {
      if (!token) {
        return fail(403, { error: 'Registrierung erfordert eine Einladung.' })
      }

      // Validate token
      const invite = await getInviteByToken(token)
      const now = new Date()

      if (!invite || invite.usedAt !== null || invite.expiresAt <= now) {
        return fail(403, { error: 'Der Einladungslink ist ungültig oder abgelaufen.' })
      }
    }

    // Create the user via Better Auth
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: { user?: { id: string } } | null = null
    try {
      result = await (auth as any).api.signUpEmail({
        body: { email, password, name },
      })
    } catch {
      return fail(400, { error: 'Registrierung fehlgeschlagen. Bitte versuche es erneut.' })
    }

    if (!result?.user) {
      return fail(400, { error: 'Registrierung fehlgeschlagen.' })
    }

    const userId = result.user.id

    if (isFirst) {
      // First user — create household and make them admin
      await createHousehold(userId, name + 's Haushalt')
    } else {
      // Invited user — mark invite as used and add to household
      const invite = await getInviteByToken(token)
      if (invite) {
        await db
          .update(invites)
          .set({ usedAt: new Date() })
          .where(eq(invites.token, token))

        await db.insert(householdMembers).values({
          householdId: invite.householdId,
          userId,
          role: 'member',
        })
      }
    }

    redirect(302, '/login')
  },
}
