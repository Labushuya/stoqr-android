import { getDb } from '$data/db';
import { locations, storages, places } from '@stoqr/db';
import { eq, and, asc } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function getLocations(householdId: string) {
	const db = getDb();
	return db.query.locations.findMany({
		where: eq(locations.householdId, householdId),
		orderBy: asc(locations.sortOrder),
		with: {
			storages: {
				orderBy: asc(storages.sortOrder),
				with: {
					places: {
						orderBy: asc(places.sortOrder),
					},
				},
			},
		},
	});
}

export async function getLocation(id: string, householdId: string) {
	const db = getDb();
	return db.query.locations.findFirst({
		where: (l, { and }) => and(eq(l.id, id), eq(l.householdId, householdId)),
		with: {
			storages: {
				orderBy: asc(storages.sortOrder),
				with: {
					places: {
						orderBy: asc(places.sortOrder),
					},
				},
			},
		},
	});
}

export async function createLocation(data: {
	householdId: string;
	name: string;
	icon?: string;
}) {
	const db = getDb();
	const [record] = await db
		.insert(locations)
		.values({
			householdId: data.householdId,
			name: data.name,
			icon: data.icon,
		})
		.returning();
	return record;
}

export async function updateLocation(
	id: string,
	householdId: string,
	data: { name?: string; icon?: string; sortOrder?: number }
) {
	const db = getDb();
	const [record] = await db
		.update(locations)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.icon !== undefined && { icon: data.icon }),
			...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
		})
		.where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
		.returning();
	return record;
}

export async function deleteLocation(id: string, householdId: string) {
	const db = getDb();
	const [record] = await db
		.delete(locations)
		.where(and(eq(locations.id, id), eq(locations.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Storages
// ---------------------------------------------------------------------------

export async function createStorage(data: {
	locationId: string;
	name: string;
	storageType?: string;
	temperatureZone?: string;
	icon?: string;
}) {
	const db = getDb();
	const [record] = await db
		.insert(storages)
		.values({
			locationId: data.locationId,
			name: data.name,
			storageType: data.storageType as typeof storages.$inferInsert['storageType'],
			temperatureZone: data.temperatureZone as typeof storages.$inferInsert['temperatureZone'],
			icon: data.icon,
		})
		.returning();
	return record;
}

export async function updateStorage(
	id: string,
	data: Partial<{
		name: string;
		storageType: string;
		temperatureZone: string;
		icon: string;
		sortOrder: number;
	}>
) {
	const db = getDb();
	const [record] = await db
		.update(storages)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.storageType !== undefined && {
				storageType: data.storageType as typeof storages.$inferInsert['storageType'],
			}),
			...(data.temperatureZone !== undefined && {
				temperatureZone: data.temperatureZone as typeof storages.$inferInsert['temperatureZone'],
			}),
			...(data.icon !== undefined && { icon: data.icon }),
			...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
		})
		.where(eq(storages.id, id))
		.returning();
	return record;
}

export async function deleteStorage(id: string) {
	const db = getDb();
	const [record] = await db.delete(storages).where(eq(storages.id, id)).returning();
	return record;
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export async function createPlace(data: {
	storageId: string;
	name: string;
	icon?: string;
}) {
	const db = getDb();
	const [record] = await db
		.insert(places)
		.values({
			storageId: data.storageId,
			name: data.name,
			icon: data.icon,
		})
		.returning();
	return record;
}

export async function updatePlace(
	id: string,
	data: Partial<{
		name: string;
		icon: string;
		sortOrder: number;
	}>
) {
	const db = getDb();
	const [record] = await db
		.update(places)
		.set({
			...(data.name !== undefined && { name: data.name }),
			...(data.icon !== undefined && { icon: data.icon }),
			...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
		})
		.where(eq(places.id, id))
		.returning();
	return record;
}

export async function deletePlace(id: string) {
	const db = getDb();
	const [record] = await db.delete(places).where(eq(places.id, id)).returning();
	return record;
}
