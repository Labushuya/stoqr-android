import { getDb } from '$data/db'
import { inventoryItems, locations } from '@stoqr/db'
import { and, eq, lt, lte, gte, isNotNull, asc, sql } from 'drizzle-orm'

function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface DashboardStats {
  totalItems: number
  expiringThisWeek: number
  expiredCount: number
  locationCount: number
}

export async function getDashboardStats(householdId: string): Promise<DashboardStats> {
  const db = getDb()
  const todayStr = today()
  const weekStr = dateOffset(7)

  const [totalResult, expiringResult, expiredResult, locationResult] = await Promise.all([
    db
      .select({ count: sql`cast(count(*) as integer)` })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.householdId, householdId), eq(inventoryItems.status, 'available'))),
    db
      .select({ count: sql`cast(count(*) as integer)` })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.householdId, householdId),
          eq(inventoryItems.status, 'available'),
          isNotNull(inventoryItems.bestBeforeDate),
          gte(inventoryItems.bestBeforeDate, todayStr),
          lte(inventoryItems.bestBeforeDate, weekStr)
        )
      ),
    db
      .select({ count: sql`cast(count(*) as integer)` })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.householdId, householdId),
          eq(inventoryItems.status, 'available'),
          isNotNull(inventoryItems.bestBeforeDate),
          lt(inventoryItems.bestBeforeDate, todayStr)
        )
      ),
    db
      .select({ count: sql`cast(count(*) as integer)` })
      .from(locations)
      .where(eq(locations.householdId, householdId)),
  ])

  return {
    totalItems: (totalResult[0]?.count as number) ?? 0,
    expiringThisWeek: (expiringResult[0]?.count as number) ?? 0,
    expiredCount: (expiredResult[0]?.count as number) ?? 0,
    locationCount: (locationResult[0]?.count as number) ?? 0,
  }
}

export async function getExpiringItems(householdId: string, days = 14) {
  const db = getDb()
  const cutoff = dateOffset(days)
  const todayStr = today()

  return db.query.inventoryItems.findMany({
    where: (item, { and, eq, isNotNull, gte, lte }) =>
      and(
        eq(item.householdId, householdId),
        eq(item.status, 'available'),
        isNotNull(item.bestBeforeDate),
        gte(item.bestBeforeDate, todayStr),
        lte(item.bestBeforeDate, cutoff)
      ),
    orderBy: [asc(inventoryItems.bestBeforeDate)],
    with: {
      product: { columns: { id: true, name: true, brand: true, imageUrl: true, defaultUnit: true, gtin: true } },
      place: {
        columns: { id: true, name: true, icon: true },
        with: { storage: { columns: { id: true, name: true, icon: true }, with: { location: { columns: { id: true, name: true, icon: true } } } } },
      },
    },
  })
}

export async function getExpiredItems(householdId: string) {
  const db = getDb()
  const todayStr = today()

  return db.query.inventoryItems.findMany({
    where: (item, { and, eq, isNotNull, lt }) =>
      and(
        eq(item.householdId, householdId),
        eq(item.status, 'available'),
        isNotNull(item.bestBeforeDate),
        lt(item.bestBeforeDate, todayStr)
      ),
    orderBy: [asc(inventoryItems.bestBeforeDate)],
    with: {
      product: { columns: { id: true, name: true, brand: true, imageUrl: true, defaultUnit: true, gtin: true } },
      place: {
        columns: { id: true, name: true, icon: true },
        with: { storage: { columns: { id: true, name: true, icon: true }, with: { location: { columns: { id: true, name: true, icon: true } } } } },
      },
    },
  })
}
