import { getDb } from '$data/db'
import { households, householdMembers, invites } from '$data/schema'
import { asc } from 'drizzle-orm'
import { error } from '@sveltejs/kit'

// crypto.randomUUID() ist global (Node 18+ und Browser) — kein node:crypto-Import,
// der den App-Bundle (Browser/WebView) brechen wuerde.

export async function getHouseholdId(userId: string): Promise<string | null> {
  const db = getDb()
  const row = await db.query.householdMembers.findFirst({
    where: (hm, { eq }) => eq(hm.userId, userId),
    columns: { householdId: true },
  })
  return row?.householdId ?? null
}

export async function requireHouseholdId(userId: string): Promise<string> {
  const hid = await getHouseholdId(userId)
  if (!hid) throw error(403, 'Kein Haushalt gefunden')
  return hid
}

export async function getHouseholdRole(userId: string): Promise<'admin' | 'member' | null> {
  const db = getDb()
  const row = await db.query.householdMembers.findFirst({
    where: (hm, { eq }) => eq(hm.userId, userId),
    columns: { role: true },
  })
  return (row?.role as 'admin' | 'member') ?? null
}

export async function getHouseholdMembers(householdId: string) {
  const db = getDb()
  return db.query.householdMembers.findMany({
    where: (hm, { eq }) => eq(hm.householdId, householdId),
    with: { user: { columns: { id: true, email: true, displayName: true } } },
    orderBy: (hm) => [asc(hm.joinedAt)],
  })
}

export async function createHousehold(
  creatorUserId: string,
  name: string
): Promise<{ householdId: string }> {
  const db = getDb()
  const householdId = crypto.randomUUID()
  await db.insert(households).values({ id: householdId, name, createdBy: creatorUserId })
  await db.insert(householdMembers).values({ householdId, userId: creatorUserId, role: 'admin' })
  return { householdId }
}

export async function getUnits(householdId: string) {
  const db = getDb()
  return db.query.units.findMany({
    where: (u, { or, isNull, eq }) => or(isNull(u.householdId), eq(u.householdId, householdId)),
    orderBy: (u) => [asc(u.sortOrder)],
  })
}

export async function createInvite(
  householdId: string,
  email: string,
  createdBy: string
): Promise<{ token: string }> {
  const db = getDb()
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.insert(invites).values({ householdId, email, token, createdBy, expiresAt })
  return { token }
}

export async function getInviteByToken(token: string) {
  const db = getDb()
  return db.query.invites.findFirst({
    where: (inv, { eq }) => eq(inv.token, token),
  })
}
