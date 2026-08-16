import type { PageLoad } from './$types'

export const load: PageLoad = async () => {
  if (__STOQR_TARGET__ === 'app') {
    // App-Target (SPA, offline): dieselbe load-Shape wie +page.server.ts, aber
    // direkt gegen die On-Device-SQLite. Single-Household/Single-User:
    //  - householdId  = LOCAL_HOUSEHOLD_ID (keine Auth, kein requireHouseholdId)
    //  - currentUserId = 'local-user' (spiegelt die synthetische Identitaet aus +layout.ts)
    //  - role         = 'admin' (der lokale Nutzer ist offline immer Admin)
    const { LOCAL_HOUSEHOLD_ID, sqliteSchema } = await import('@stoqr/db/sqlite')
    const { getDb } = await import('$data/db')
    const { getHouseholdMembers } = await import('$data/queries/households')
    const { and, eq, isNull, gt, desc } = await import('drizzle-orm')

    const householdId = LOCAL_HOUSEHOLD_ID
    const db = getDb() as unknown as import('@stoqr/db/sqlite').SqliteDatabase

    // getHouseholdMembers joint users; falls das offline (kein users-Join) crasht,
    // defensiv auf [] zurueckfallen — die Shape zaehlt.
    let members: Awaited<ReturnType<typeof getHouseholdMembers>> = []
    try {
      members = await getHouseholdMembers(householdId)
    } catch {
      members = []
    }

    // Open (unused, non-expired) invites. Offline vermutlich leer -> [] ist ok.
    const now = new Date()
    let openInvites: Awaited<ReturnType<typeof db.query.invites.findMany>> = []
    try {
      openInvites = await db.query.invites.findMany({
        where: and(
          eq(sqliteSchema.invites.householdId, householdId),
          isNull(sqliteSchema.invites.usedAt),
          gt(sqliteSchema.invites.expiresAt, now),
        ),
        orderBy: [desc(sqliteSchema.invites.expiresAt)],
      })
    } catch {
      openInvites = []
    }

    return {
      members,
      openInvites,
      role: 'admin' as const,
      currentUserId: 'local-user',
      householdId,
    }
  }

  // Pi: Server-Load (+page.server.ts) bleibt Quelle. Leeres Objekt merged,
  // laesst die Server-Daten intakt.
  return {}
}
