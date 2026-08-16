import { getDb } from '$data/db'
import { products, inventoryItems, categories, productFieldSources } from '@stoqr/db'
import { eq, asc, desc, and, ilike } from 'drizzle-orm'
import { getUnits } from './households'
import { buildUnitMetaMap, aggregateStock, buildPackSize, type StockTotals } from '$lib/utils/stock'

// ---------------------------------------------------------------------------
// Inventory — list
// ---------------------------------------------------------------------------

export async function getInventoryItems(
	householdId: string,
	filters?: { placeId?: string; status?: string; allStatuses?: boolean }
) {
	const db = getDb();
	return db.query.inventoryItems.findMany({
		where: (item, { and, eq }) =>
			and(
				eq(item.householdId, householdId),
				// allStatuses: alle Status laden (fuer den „Nur verfuegbare"-Toggle, G8-5c);
				// sonst der angeforderte Status bzw. Default 'available'.
				filters?.allStatuses
					? undefined
					: eq(
							item.status,
							(filters?.status ?? 'available') as
								| 'available'
								| 'consumed'
								| 'expired'
								| 'donated'
								| 'discarded'
						),
				filters?.placeId ? eq(item.placeId, filters.placeId) : undefined
			),
		orderBy: [asc(inventoryItems.bestBeforeDate), desc(inventoryItems.createdAt)],
		with: {
			product: {
				columns: {
					id: true,
					name: true,
					brand: true,
					imageUrl: true,
					defaultUnit: true,
					defaultQuantity: true,
					// Gebinde-Größe (Einheiten v2): fuer buildPackSize in der Artikel-Ansicht,
					// damit count-Gebinde (z.B. "Flasche") korrekt auf Volumen/Masse aggregieren.
					defaultVolumeMl: true,
					defaultWeightG: true,
					gtin: true,
					categoryId: true,
					// Pfand (G48): fuer das DepositBadge in Inventar-Karten/Artikel-Ansicht.
					hasDeposit: true,
					depositCt: true,
				},
				with: {
					category: true,
				},
			},
			place: {
				columns: {
					id: true,
					name: true,
					icon: true,
				},
				with: {
					storage: {
						columns: {
							id: true,
							name: true,
							icon: true,
							storageType: true,
							temperatureZone: true,
						},
						with: {
							location: {
								columns: {
									id: true,
									name: true,
									icon: true,
								},
							},
						},
					},
				},
			},
			store: {
				columns: {
					id: true,
					name: true,
					chain: true,
				},
			},
		},
	});
}

// ---------------------------------------------------------------------------
// Inventory — all stock entries for one product (aggregated article view)
// ---------------------------------------------------------------------------

export async function listInventoryForProduct(productId: string, householdId: string) {
	const db = getDb();
	return db.query.inventoryItems.findMany({
		where: (item, { and, eq }) =>
			and(eq(item.productId, productId), eq(item.householdId, householdId)),
		orderBy: [asc(inventoryItems.bestBeforeDate), desc(inventoryItems.createdAt)],
		with: {
			place: {
				columns: { id: true, name: true, icon: true },
				with: {
					storage: {
						columns: { id: true, name: true, icon: true },
						with: {
							location: { columns: { id: true, name: true, icon: true } },
						},
					},
				},
			},
			store: {
				columns: { id: true, name: true, chain: true },
			},
		},
	});
}

// ---------------------------------------------------------------------------
// Inventory — Vorbelegungs-Hinweise: haeufigster Ort/Markt vorhandener Bestaende
// (Block C: neue Bestaende erben bekannte Werte desselben Artikels)
// ---------------------------------------------------------------------------

// Haeufigsten Wert bestimmen; bei Gleichstand gewinnt der zuerst gesehene
// (Liste ist nach createdAt desc sekundaer sortiert → juengster zuerst).
function mostFrequent<T>(values: (T | null | undefined)[]): T | null {
	const counts = new Map<T, number>();
	let best: T | null = null;
	let bestCount = 0;
	for (const v of values) {
		if (v == null) continue;
		const c = (counts.get(v) ?? 0) + 1;
		counts.set(v, c);
		if (c > bestCount) {
			best = v;
			bestCount = c;
		}
	}
	return best;
}

export async function suggestStorePlaceForProduct(productId: string, householdId: string) {
	const db = getDb();
	const items = await listInventoryForProduct(productId, householdId);

	const placeId = mostFrequent(items.map((i) => i.place?.id));
	let storeId = mostFrequent(items.map((i) => i.store?.id));

	// Fallback (G8-2): kein Herkunftsmarkt aus vorhandenen Bestaenden bekannt →
	// den (ersten) am Artikel zugeordneten Markt (product_stores) vorschlagen.
	if (!storeId) {
		const [ps] = await db.query.productStores.findMany({
			where: (t, { and, eq }) => and(eq(t.productId, productId), eq(t.householdId, householdId)),
			columns: { storeId: true },
			limit: 1,
		});
		storeId = ps?.storeId ?? null;
	}

	// Ort-Kette (location → storage → place) fuer den vorgeschlagenen Platz auffuellen
	let locationId: string | null = null;
	let storageId: string | null = null;
	if (placeId) {
		const item = items.find((i) => i.place?.id === placeId);
		storageId = item?.place?.storage?.id ?? null;
		locationId = item?.place?.storage?.location?.id ?? null;
	}

	return { locationId, storageId, placeId, storeId };
}

/**
 * Haeufigste Einheit der VERFUEGBAREN Bestaende eines Artikels (fuer die
 * Preis-Vorschlags-Einheit). Nur `available` zaehlt, damit konsumierte/
 * entsorgte Altbestaende die Einheit nicht in eine veraltete ziehen.
 * Kein Bestand → null (Aufrufer faellt auf defaultUnit/'piece' zurueck).
 */
export async function suggestStockUnitForProduct(
	productId: string,
	householdId: string
): Promise<string | null> {
	const items = await listInventoryForProduct(productId, householdId);
	return mostFrequent(items.filter((i) => i.status === 'available').map((i) => i.unit));
}

// ---------------------------------------------------------------------------
// Inventory — aggregated stock totals for one product (Umrechnungsschicht)
// ---------------------------------------------------------------------------

export async function getProductStockTotals(
	productId: string,
	householdId: string
): Promise<StockTotals> {
	const db = getDb();
	const [items, units, product] = await Promise.all([
		listInventoryForProduct(productId, householdId),
		getUnits(householdId),
		db.query.products.findFirst({
			where: eq(products.id, productId),
			columns: { defaultUnit: true, defaultVolumeMl: true, defaultWeightG: true },
		}),
	]);
	const metaMap = buildUnitMetaMap(units);
	const packSize = product ? buildPackSize(product) : undefined;
	return aggregateStock(items, metaMap, packSize);
}

// ---------------------------------------------------------------------------
// Inventory — single item
// ---------------------------------------------------------------------------

export async function getInventoryItem(id: string, householdId: string) {
	const db = getDb();
	return db.query.inventoryItems.findFirst({
		where: (item, { and, eq }) => and(eq(item.id, id), eq(item.householdId, householdId)),
		with: {
			product: {
				with: {
					category: true,
					nutrients: {
						with: {
							nutrientType: true,
						},
					},
				},
			},
			place: {
				with: {
					storage: {
						with: {
							location: true,
						},
					},
				},
			},
			store: true,
		},
	});
}

// ---------------------------------------------------------------------------
// Inventory — create
// ---------------------------------------------------------------------------

export async function createInventoryItem(data: {
	productId: string;
	placeId?: string;
	householdId: string;
	quantity?: number | string;
	unit?: string;
	bestBeforeDate?: string;
	purchaseDate?: string;
	purchasePriceCt?: number;
	notes?: string;
	storeId?: string;
	gtin?: string;
}) {
	const db = getDb();
	const [record] = await db
		.insert(inventoryItems)
		.values({
			productId: data.productId,
			placeId: data.placeId,
			householdId: data.householdId,
			quantity: data.quantity?.toString() ?? '1',
			unit: data.unit ?? 'piece',
			bestBeforeDate: data.bestBeforeDate,
			purchaseDate: data.purchaseDate,
			purchasePriceCt: data.purchasePriceCt,
			notes: data.notes,
			storeId: data.storeId,
			gtin: data.gtin,
		})
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Inventory — update
// ---------------------------------------------------------------------------

export async function updateInventoryItem(
	id: string,
	householdId: string,
	data: Partial<{
		productId: string;
		placeId: string | null;
		quantity: number | string;
		unit: string;
		bestBeforeDate: string | null;
		purchaseDate: string | null;
		notes: string | null;
		storeId: string | null;
		gtin: string | null;
		status: 'available' | 'consumed' | 'expired' | 'donated' | 'discarded';
		openedAt: Date | null;
		openedExpiryDays: number | null;
		purchasePriceCt: number | null;
		lotNumber: string | null;
		weightG: number | string | null;
		volumeMl: number | string | null;
	}>
) {
	const db = getDb();
	// Build set object only with defined keys to avoid accidentally nulling fields.
	const patch: Record<string, unknown> = { updatedAt: new Date() };

	if (data.productId !== undefined) patch.productId = data.productId;
	if (data.placeId !== undefined) patch.placeId = data.placeId;
	if (data.quantity !== undefined) patch.quantity = data.quantity?.toString();
	if (data.unit !== undefined) patch.unit = data.unit;
	if (data.bestBeforeDate !== undefined) patch.bestBeforeDate = data.bestBeforeDate;
	if (data.purchaseDate !== undefined) patch.purchaseDate = data.purchaseDate;
	if (data.notes !== undefined) patch.notes = data.notes;
	if (data.storeId !== undefined) patch.storeId = data.storeId;
	if (data.gtin !== undefined) patch.gtin = data.gtin;
	if (data.status !== undefined) patch.status = data.status;
	// consumedAt automatisch pflegen (G41): Übergang weg von 'available' stempelt den
	// Zeitpunkt (für „verbraucht vor X Tagen"); Wiederherstellen auf 'available' nullt ihn.
	// Gilt für alle Nicht-available-Status (consumed/donated/discarded/expired). So profitieren
	// ALLE Client-Pfade, ohne consumedAt explizit im Request mitzusenden.
	if (data.status !== undefined) {
		patch.consumedAt = data.status === 'available' ? null : new Date();
	}
	if (data.openedAt !== undefined) patch.openedAt = data.openedAt;
	if (data.openedExpiryDays !== undefined) patch.openedExpiryDays = data.openedExpiryDays;
	if (data.purchasePriceCt !== undefined) patch.purchasePriceCt = data.purchasePriceCt;
	if (data.lotNumber !== undefined) patch.lotNumber = data.lotNumber;
	if (data.weightG !== undefined) patch.weightG = data.weightG?.toString();
	if (data.volumeMl !== undefined) patch.volumeMl = data.volumeMl?.toString();

	const [record] = await db
		.update(inventoryItems)
		.set(patch as Record<string, unknown>)
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Inventory — hard delete
// ---------------------------------------------------------------------------

export async function deleteInventoryItem(id: string, householdId: string) {
	const db = getDb();
	const [record] = await db
		.delete(inventoryItems)
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Products — delete (hard delete, only if no active inventory items remain)
// ---------------------------------------------------------------------------

export async function deleteProduct(id: string) {
	const db = getDb();
	const [record] = await db
		.delete(products)
		.where(eq(products.id, id))
		.returning({ id: products.id });
	return record ?? null;
}

// ---------------------------------------------------------------------------
// Inventory — consume (reduce quantity or mark consumed)
// ---------------------------------------------------------------------------

export async function consumeInventoryItem(id: string, householdId: string, amount: number) {
	const db = getDb();
	const item = await db.query.inventoryItems.findFirst({
		where: (i, { and, eq }) => and(eq(i.id, id), eq(i.householdId, householdId)),
		columns: { quantity: true },
	});

	if (!item) return null;

	const remaining = parseFloat(item.quantity) - amount;

	if (remaining <= 0) {
		const [record] = await db
			.update(inventoryItems)
			.set({
				quantity: '0',
				status: 'consumed',
				consumedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
			.returning();
		return record;
	}

	const [record] = await db
		.update(inventoryItems)
		.set({ quantity: remaining.toString(), updatedAt: new Date() })
		.where(and(eq(inventoryItems.id, id), eq(inventoryItems.householdId, householdId)))
		.returning();
	return record;
}

// ---------------------------------------------------------------------------
// Products — create
// ---------------------------------------------------------------------------

export async function createProduct(data: {
	name: string;
	brand?: string;
	gtin?: string;
	categoryId?: string;
	description?: string;
	notes?: string;
	imageUrl?: string;
	defaultUnit?: string;
	defaultQuantity?: number | string;
	defaultWeightG?: number | string;
	defaultVolumeMl?: number | string;
	expiryToleranceDays?: number;
	bringItemId?: string;
	hasDeposit?: boolean;
	depositCt?: number | null;
	createdBy?: string;
	offData?: unknown;
}) {
	const db = getDb();
	const [record] = await db
		.insert(products)
		.values({
			name: data.name,
			brand: data.brand,
			gtin: data.gtin,
			categoryId: data.categoryId,
			description: data.description,
			notes: data.notes,
			imageUrl: data.imageUrl,
			defaultUnit: data.defaultUnit ?? 'piece',
			defaultQuantity: data.defaultQuantity?.toString() ?? '1',
			defaultWeightG: data.defaultWeightG?.toString(),
			defaultVolumeMl: data.defaultVolumeMl?.toString(),
			expiryToleranceDays: data.expiryToleranceDays,
			bringItemId: data.bringItemId,
			hasDeposit: data.hasDeposit ?? false,
			depositCt: data.depositCt ?? null,
			createdBy: data.createdBy,
			offData: data.offData as Record<string, unknown>,
		})
		.returning({ id: products.id });
	return record.id;
}

// ---------------------------------------------------------------------------
// Products — list all (article catalog; products are global / shared)
// ---------------------------------------------------------------------------

export async function listProducts() {
	const db = getDb();
	return db.query.products.findMany({
		orderBy: [asc(products.name)],
		columns: {
			id: true,
			name: true,
			brand: true,
			description: true,
			notes: true,
			categoryId: true,
			defaultUnit: true,
			gtin: true,
			imageUrl: true,
			// Pfand (G48): fuer das DepositBadge in der Artikel-Liste (Einstellungen).
			hasDeposit: true,
			depositCt: true,
		},
		with: {
			category: true,
		},
	});
}

// ---------------------------------------------------------------------------
// Products — update master data
// ---------------------------------------------------------------------------

export async function updateProduct(
	id: string,
	data: Partial<{
		name: string;
		brand: string | null;
		description: string | null;
		notes: string | null;
		categoryId: string | null;
		defaultUnit: string;
		gtin: string | null;
		imageUrl: string | null;
		defaultVolumeMl: number | string | null;
		defaultWeightG: number | string | null;
		defaultQuantity: number | string;
		hasDeposit: boolean;
		depositCt: number | null;
	}>
) {
	const db = getDb();
	const patch: Record<string, unknown> = { updatedAt: new Date() };
	if (data.name !== undefined) patch.name = data.name;
	if (data.brand !== undefined) patch.brand = data.brand;
	if (data.description !== undefined) patch.description = data.description;
	if (data.notes !== undefined) patch.notes = data.notes;
	if (data.categoryId !== undefined) patch.categoryId = data.categoryId;
	if (data.defaultUnit !== undefined) patch.defaultUnit = data.defaultUnit;
	if (data.gtin !== undefined) patch.gtin = data.gtin;
	if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl;
	if (data.hasDeposit !== undefined) patch.hasDeposit = data.hasDeposit;
	if (data.depositCt !== undefined) patch.depositCt = data.depositCt;
	// Gebinde-Größe (Einheiten v2): numeric-Felder als String; null = kein Gebinde.
	if (data.defaultVolumeMl !== undefined)
		patch.defaultVolumeMl = data.defaultVolumeMl == null ? null : String(data.defaultVolumeMl);
	if (data.defaultWeightG !== undefined)
		patch.defaultWeightG = data.defaultWeightG == null ? null : String(data.defaultWeightG);
	if (data.defaultQuantity !== undefined) patch.defaultQuantity = String(data.defaultQuantity);

	const [record] = await db
		.update(products)
		.set(patch)
		.where(eq(products.id, id))
		.returning();
	return record ?? null;
}

// ---------------------------------------------------------------------------
// Products — find by GTIN or return null
// ---------------------------------------------------------------------------

export async function getOrCreateProductByGtin(gtin: string) {
	const db = getDb();
	const existing = await db.query.products.findFirst({
		where: eq(products.gtin, gtin),
	});
	return existing ?? null;
}

// ---------------------------------------------------------------------------
// Products — find by id
// ---------------------------------------------------------------------------

export async function getProductById(id: string) {
	const db = getDb();
	const product = await db.query.products.findFirst({
		where: eq(products.id, id),
		with: { category: true },
		columns: {
			id: true,
			name: true,
			brand: true,
			gtin: true,
			description: true,
			notes: true,
			imageUrl: true,
			categoryId: true,
			defaultUnit: true,
			defaultQuantity: true,
			defaultVolumeMl: true,
			defaultWeightG: true,
			hasDeposit: true,
			depositCt: true,
		},
	});
	return product ?? null;
}

// ---------------------------------------------------------------------------
// Feld-Provenienz (G15) — Quelle je Stammdaten-Feld: 'off'|'globus'|'manual'.
// ---------------------------------------------------------------------------

export type ProductField = 'name' | 'brand' | 'image' | 'category' | 'unit' | 'description' | 'deposit';
export type FieldSource = 'off' | 'globus' | 'manual';

/** Setzt die Herkunft je Feld (Upsert auf (product_id, field)). Leere Map = no-op. */
export async function setFieldSources(
	productId: string,
	sources: Partial<Record<ProductField, FieldSource>>
): Promise<void> {
	const db = getDb();
	const entries = Object.entries(sources).filter(([, v]) => v != null) as [ProductField, FieldSource][];
	if (entries.length === 0) return;
	for (const [field, source] of entries) {
		await db
			.insert(productFieldSources)
			.values({ productId, field, source })
			.onConflictDoUpdate({
				target: [productFieldSources.productId, productFieldSources.field],
				set: { source, updatedAt: new Date() },
			});
	}
}

/**
 * Entfernt die Feld-Herkunft eines einzelnen Feldes (loescht die Zeile). Danach
 * gilt die Herkunft als 'nicht erfasst' → SourceBadge zeigt '?' und ein manueller
 * Schutz (source 'manual') faellt weg, sodass Mapping-Regeln/Auto-Match wieder
 * greifen (G32). Der Feld-WERT am Artikel bleibt unveraendert.
 */
export async function clearFieldSource(productId: string, field: ProductField): Promise<void> {
	const db = getDb();
	await db
		.delete(productFieldSources)
		.where(and(eq(productFieldSources.productId, productId), eq(productFieldSources.field, field)));
}

/** Liefert die Herkunft je Feld als Map (fehlende Felder bleiben undefined). */
export async function getFieldSources(
	productId: string
): Promise<Partial<Record<ProductField, FieldSource>>> {
	const db = getDb();
	const rows = await db
		.select({ field: productFieldSources.field, source: productFieldSources.source })
		.from(productFieldSources)
		.where(eq(productFieldSources.productId, productId));
	const out: Partial<Record<ProductField, FieldSource>> = {};
	for (const r of rows) out[r.field as ProductField] = r.source;
	return out;
}

// ---------------------------------------------------------------------------
// Products — search by name / brand
// ---------------------------------------------------------------------------

export async function searchProducts(query: string) {
	const db = getDb();
	return db.query.products.findMany({
		where: (p, { or, eq }) =>
			or(ilike(p.name, `%${query}%`), ilike(p.brand, `%${query}%`), eq(p.gtin, query)),
		orderBy: [asc(products.name)],
		limit: 25,
		columns: {
			id: true,
			name: true,
			brand: true,
			gtin: true,
			imageUrl: true,
			defaultUnit: true,
			defaultQuantity: true,
			categoryId: true,
		},
		with: {
			category: true,
		},
	});
}

// ---------------------------------------------------------------------------
// Categories — all, ordered
// ---------------------------------------------------------------------------

export async function getCategories() {
	const db = getDb();
	return db.query.categories.findMany({
		orderBy: [asc(categories.sortOrder), asc(categories.name)],
		with: {
			children: {
				orderBy: [asc(categories.sortOrder), asc(categories.name)],
			},
		},
	});
}
