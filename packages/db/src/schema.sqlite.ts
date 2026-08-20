import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { relations, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  // stoqr-internal field, not managed by Better Auth.
  // Nullable so Better Auth signup (which doesn't provide username) works out of the box.
  username: text('username').unique(),
  displayName: text('display_name'),
  email: text('email').unique(),
  // Better Auth required fields
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  passwordHash: text('password_hash'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  locale: text('locale').notNull().default('de-DE'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
  auditLog: many(auditLog),
  createdProducts: many(products, { relationName: 'productCreator' }),
}));

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export const locations = sqliteTable('locations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: text('name').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const locationsRelations = relations(locations, ({ one, many }) => ({
  household: one(households, {
    fields: [locations.householdId],
    references: [households.id],
  }),
  storages: many(storages),
}));

// ---------------------------------------------------------------------------
// storages
// ---------------------------------------------------------------------------

export const storages = sqliteTable('storages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  locationId: text('location_id')
    .notNull()
    .references(() => locations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  storageType: text('storage_type').$type<
    'fridge' | 'freezer' | 'shelf' | 'cabinet' | 'other'
  >(),
  temperatureZone: text('temperature_zone').$type<
    'ambient' | 'chilled' | 'frozen'
  >(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const storagesRelations = relations(storages, ({ one, many }) => ({
  location: one(locations, {
    fields: [storages.locationId],
    references: [locations.id],
  }),
  places: many(places),
}));

// ---------------------------------------------------------------------------
// places
// ---------------------------------------------------------------------------

export const places = sqliteTable('places', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  storageId: text('storage_id')
    .notNull()
    .references(() => storages.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  icon: text('icon'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const placesRelations = relations(places, ({ one, many }) => ({
  storage: one(storages, {
    fields: [places.storageId],
    references: [storages.id],
  }),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
}));

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  parentId: text('parent_id').references((): AnySQLiteColumn => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  icon: text('icon'),
  defaultExpiryToleranceDays: integer('default_expiry_tolerance_days').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryParent',
  }),
  children: many(categories, { relationName: 'categoryParent' }),
  products: many(products),
}));

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------

export const products = sqliteTable('products', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  gtin: text('gtin').unique(),
  name: text('name').notNull(),
  brand: text('brand'),
  categoryId: text('category_id').references(() => categories.id),
  description: text('description'),
  notes: text('notes'),
  imageUrl: text('image_url'),
  defaultUnit: text('default_unit').notNull().default('piece'),
  defaultQuantity: text('default_quantity').notNull().default('1'),
  defaultWeightG: text('default_weight_g'),
  defaultVolumeMl: text('default_volume_ml'),
  offData: text('off_data', { mode: 'json' }),
  offFetchedAt: integer('off_fetched_at', { mode: 'timestamp_ms' }),
  isVerified: integer('is_verified', { mode: 'boolean' }).notNull().default(false),
  expiryToleranceDays: integer('expiry_tolerance_days'),
  bringItemId: text('bring_item_id'),
  // Pfand (G47): has_deposit = Artikel bedarf Pfand; deposit_ct = Betrag in Cent
  // (nullable — nur wenn bekannt). Pfand ist EAN-Eigenschaft (Artikel-Ebene).
  hasDeposit: integer('has_deposit', { mode: 'boolean' }).notNull().default(false),
  depositCt: integer('deposit_ct'),
  createdBy: text('created_by').references(() => users.id, { relationName: 'productCreator' } as any),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  creator: one(users, {
    fields: [products.createdBy],
    references: [users.id],
    relationName: 'productCreator',
  }),
  nutrients: many(productNutrients),
  fieldSources: many(productFieldSources),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
  shoppingListItems: many(shoppingListItems),
  productStores: many(productStores),
}));

// ---------------------------------------------------------------------------
// product_stores (M:N Artikel<->Markt — "hier planbar erhältlich")
//
// Wiedereinführung (in Inkr.1 als überladene Bezugsquellen-Tabelle entfernt).
// Jetzt schlank: nur die Zuordnung, welche Artikel bei welchem Markt einkaufbar
// sind (Planung). Der Herkunfts-Markt eines konkreten Bestands bleibt an
// inventory_items.storeId. Preise liegen (später) in product_prices.
// ---------------------------------------------------------------------------

export const productStores = sqliteTable(
  'product_stores',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    productStoreHouseholdUniq: uniqueIndex('product_stores_product_store_household_uniq').on(
      table.productId,
      table.storeId,
      table.householdId
    ),
  })
);

export const productStoresRelations = relations(productStores, ({ one }) => ({
  product: one(products, {
    fields: [productStores.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [productStores.storeId],
    references: [stores.id],
  }),
  household: one(households, {
    fields: [productStores.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// product_prices — Preise je Artikel+Markt mit Historie (Block F / M3)
//
// Append-only Historie. Genau EIN Eintrag je (productId, storeId, householdId)
// traegt isCurrent=true = der massgebliche Preis fuers Estimate (partieller
// Unique-Index in der Migration erzwingt das). priceCt ist der Preis PRO Einheit
// (unit). isReduced markiert ein Angebot; ein reduzierter Preis wird nur dann
// isCurrent, wenn er ausdruecklich als Dauerpreis uebernommen wurde.
// ---------------------------------------------------------------------------

export const productPrices = sqliteTable(
  'product_prices',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    priceCt: integer('price_ct').notNull(),
    unit: text('unit').notNull(),
    // Grundpreis (PAngV, G44): gesetzlich ausgezeichneter Preis je Basiseinheit,
    // z.B. 19 Cent / 'l'. Aus dem Globus-Suggest-HTML (reference-price). Nullable:
    // nicht jeder Artikel/Markt zeichnet einen Grundpreis aus.
    basePriceCt: integer('base_price_ct'),
    basePriceUnit: text('base_price_unit'),
    isReduced: integer('is_reduced', { mode: 'boolean' }).notNull().default(false),
    // G47: true = der Preis (priceCt) enthält das Pfand bereits → nicht zusätzlich
    // addieren; false (Default) = zzgl. Pfand (products.deposit_ct je Stück).
    priceIncludesDeposit: integer('price_includes_deposit', { mode: 'boolean' }).notNull().default(false),
    isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
    // Freigabe-Status: 'proposed' = Online-Vorschlag (Staging, nie is_current),
    // 'confirmed' = vom User bestaetigt/maßgeblich, 'rejected' = verworfen (Historie).
    // Kern-Invariante: status != 'confirmed' => is_current = false.
    status: text('status')
      .notNull()
      .default('confirmed')
      .$type<'proposed' | 'confirmed' | 'rejected'>(),
    source: text('source').notNull().$type<'manual' | 'booked' | 'online'>(),
    note: text('note'),
    recordedAt: integer('recorded_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    productHouseholdIdx: index('product_prices_product_household_idx').on(
      table.productId,
      table.householdId
    ),
    storeIdx: index('product_prices_store_idx').on(table.storeId),
    // Max. 1 offener Vorschlag je Artikel+Markt+Haushalt (verhindert Vorschlags-Flut).
    proposedUniq: uniqueIndex('product_prices_proposed_uniq')
      .on(table.productId, table.storeId, table.householdId)
      .where(sql`status = 'proposed'`),
  })
);

export const productPricesRelations = relations(productPrices, ({ one }) => ({
  product: one(products, {
    fields: [productPrices.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [productPrices.storeId],
    references: [stores.id],
  }),
  household: one(households, {
    fields: [productPrices.householdId],
    references: [households.id],
  }),
  creator: one(users, {
    fields: [productPrices.createdBy],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// globus_snapshots (Block G7) — Roh-Landing-Zone fuer den Online-Katalog.
//
// Beim Katalog-Sync wird je Artikel-EAN das komplette verifizierte Globus-
// Suggest-JSON gespeichert (name, category, price, currency, Bild) inkl. Rohdaten.
// Aenderung unter gleicher EAN erzeugt einen neuen 'proposed'-Snapshot, der wie
// Preisvorschlaege bestaetigt/verworfen wird (Historie + Approval). productId/
// storeId nullable (Landing-Zone kann vor Produkt-Match existieren).
// ---------------------------------------------------------------------------

export const globusSnapshots = sqliteTable(
  'globus_snapshots',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: text('product_id').references(() => products.id, { onDelete: 'set null' }),
    storeId: text('store_id').references(() => stores.id, { onDelete: 'set null' }),
    gtin: text('gtin').notNull(),
    name: text('name'),
    category: text('category', { mode: 'json' }).$type<string[]>(),
    priceCt: integer('price_ct'), // nullable: preislose Treffer erlaubt
    currency: text('currency'),
    imageRemoteUrl: text('image_remote_url'),
    localImagePath: text('local_image_path'), // Pfad im MEDIA_DIR; null wenn kein Bild
    rawJson: text('raw_json', { mode: 'json' }).notNull(),
    // G44: vollstaendiges Detailseiten-HTML (Roh-Archiv) + strukturierte Feld-Landkarte
    // dieses Abrufs ({ field, value, source, belongsTo }[]) — dokumentiert, welcher
    // Wert woher kam. Beide nullable (Detailseite best-effort).
    rawDetailHtml: text('raw_detail_html'),
    extracted: text('extracted', { mode: 'json' }),
    status: text('status')
      .notNull()
      .default('proposed')
      .$type<'proposed' | 'confirmed' | 'rejected'>(),
    source: text('source').notNull().default('globus').$type<'globus'>(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
    reviewedBy: text('reviewed_by').references(() => users.id),
    createdBy: text('created_by').references(() => users.id),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    gtinHouseholdIdx: index('globus_snapshots_gtin_household_idx').on(table.gtin, table.householdId),
    productIdx: index('globus_snapshots_product_idx').on(table.productId),
    // Max. 1 offener Vorschlag je EAN+Haushalt (verhindert Snapshot-Flut).
    proposedUniq: uniqueIndex('globus_snapshots_proposed_uniq')
      .on(table.gtin, table.householdId)
      .where(sql`status = 'proposed'`),
  })
);

export const globusSnapshotsRelations = relations(globusSnapshots, ({ one }) => ({
  product: one(products, {
    fields: [globusSnapshots.productId],
    references: [products.id],
  }),
  store: one(stores, {
    fields: [globusSnapshots.storeId],
    references: [stores.id],
  }),
  household: one(households, {
    fields: [globusSnapshots.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// nutrient_types
// ---------------------------------------------------------------------------

export const nutrientTypes = sqliteTable('nutrient_types', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  unit: text('unit').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => nutrientTypes.id),
  sortOrder: integer('sort_order').notNull().default(0),
  offKey: text('off_key'),
});

export const nutrientTypesRelations = relations(nutrientTypes, ({ one, many }) => ({
  parent: one(nutrientTypes, {
    fields: [nutrientTypes.parentId],
    references: [nutrientTypes.id],
    relationName: 'nutrientTypeParent',
  }),
  children: many(nutrientTypes, { relationName: 'nutrientTypeParent' }),
  productNutrients: many(productNutrients),
}));

// ---------------------------------------------------------------------------
// product_nutrients
// ---------------------------------------------------------------------------

export const productNutrients = sqliteTable(
  'product_nutrients',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    nutrientTypeId: text('nutrient_type_id')
      .notNull()
      .references(() => nutrientTypes.id),
    valuePer100: text('value_per_100').notNull(),
    source: text('source').notNull().default('off'),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    productNutrientUniq: uniqueIndex('product_nutrients_product_nutrient_uniq').on(
      table.productId,
      table.nutrientTypeId
    ),
  })
);

export const productNutrientsRelations = relations(productNutrients, ({ one }) => ({
  product: one(products, {
    fields: [productNutrients.productId],
    references: [products.id],
  }),
  nutrientType: one(nutrientTypes, {
    fields: [productNutrients.nutrientTypeId],
    references: [nutrientTypes.id],
  }),
}));

// ---------------------------------------------------------------------------
// product_field_sources — Feld-Provenienz je Artikel (G15).
// Genau EINE Zeile je (product, field): woher stammt der aktuelle Wert dieses
// Stammdaten-Felds — 'off' (OpenFoodFacts, initiale Basis), 'globus' (Markt-
// Katalog-Abgleich) oder 'manual' (im Formular geaendert). Analog product_nutrients.
// field ∈ 'name'|'brand'|'image'|'category'|'unit'. Keine Zeile = unbekannt/Basis.
// ---------------------------------------------------------------------------

export const productFieldSources = sqliteTable(
  'product_field_sources',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    source: text('source').notNull().$type<'off' | 'globus' | 'manual'>(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    productFieldUniq: uniqueIndex('product_field_sources_product_field_uniq').on(
      table.productId,
      table.field
    ),
  })
);

export const productFieldSourcesRelations = relations(productFieldSources, ({ one }) => ({
  product: one(products, {
    fields: [productFieldSources.productId],
    references: [products.id],
  }),
}));

// ---------------------------------------------------------------------------
// category_mappings (G29): household-scoped Regeln, die einen OFF-Tag bzw. ein
// Globus-Pfad-Segment (token, lowercase) auf eine stoqr-Kategorie mappen.
// Greifen beim Barcode-Scan (source 'off') und Katalog-Sync (source 'globus')
// automatisch, VOR dem Code-Fallback. Manuelle Wahl (G20-2) bleibt Vorrang.
// ---------------------------------------------------------------------------
export const categoryMappings = sqliteTable(
  'category_mappings',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    source: text('source').notNull().$type<'off' | 'globus'>(),
    token: text('token').notNull(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    categoryMappingsUniq: uniqueIndex('category_mappings_uniq').on(
      table.householdId,
      table.source,
      table.token
    ),
  })
);

export const categoryMappingsRelations = relations(categoryMappings, ({ one }) => ({
  household: one(households, {
    fields: [categoryMappings.householdId],
    references: [households.id],
  }),
  category: one(categories, {
    fields: [categoryMappings.categoryId],
    references: [categories.id],
  }),
}));

// ---------------------------------------------------------------------------
// stores  (declared before inventory_items / stock_targets / shopping_list_items
//          to avoid forward-reference issues)
// ---------------------------------------------------------------------------

export const stores = sqliteTable('stores', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: text('name').notNull(),
  chain: text('chain'),
  address: text('address'),
  city: text('city'),
  latitude: text('latitude'),
  longitude: text('longitude'),
  bringListUuid: text('bring_list_uuid'),
  // Abruf-URL-Vorlage fuer den Online-Preis-Abruf. Enthaelt optional {EAN},
  // das beim Abruf durch die Artikel-GTIN ersetzt wird (z.B. Globus-Suggest:
  // https://produkte.globus.de/hockenheim/suggest?search={EAN}). Leer = kein Abruf.
  scrapeUrl: text('scrape_url'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const storesRelations = relations(stores, ({ one, many }) => ({
  household: one(households, {
    fields: [stores.householdId],
    references: [households.id],
  }),
  inventoryItems: many(inventoryItems),
  stockTargets: many(stockTargets),
  shoppingListItems: many(shoppingListItems),
  bringSync: many(bringSync),
  productStores: many(productStores),
}));

// ---------------------------------------------------------------------------
// inventory_items
// ---------------------------------------------------------------------------

export const inventoryItems = sqliteTable('inventory_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  placeId: text('place_id').references(() => places.id),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  // EAN/Barcode dieses konkreten Bestands (nicht des Artikels — siehe ROADMAP).
  gtin: text('gtin'),
  quantity: text('quantity').notNull().default('1'),
  unit: text('unit').notNull().default('piece'),
  weightG: text('weight_g'),
  volumeMl: text('volume_ml'),
  bestBeforeDate: text('best_before_date'),
  openedAt: integer('opened_at', { mode: 'timestamp_ms' }),
  openedExpiryDays: integer('opened_expiry_days'),
  purchaseDate: text('purchase_date'),
  purchasePriceCt: integer('purchase_price_ct'),
  storeId: text('store_id').references(() => stores.id),
  lotNumber: text('lot_number'),
  notes: text('notes'),
  status: text('status')
    .notNull()
    .default('available')
    .$type<'available' | 'consumed' | 'expired' | 'donated' | 'discarded'>(),
  consumedAt: integer('consumed_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const inventoryItemsRelations = relations(inventoryItems, ({ one }) => ({
  product: one(products, {
    fields: [inventoryItems.productId],
    references: [products.id],
  }),
  place: one(places, {
    fields: [inventoryItems.placeId],
    references: [places.id],
  }),
  household: one(households, {
    fields: [inventoryItems.householdId],
    references: [households.id],
  }),
  store: one(stores, {
    fields: [inventoryItems.storeId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// expiry_config
// ---------------------------------------------------------------------------

export const expiryConfig = sqliteTable('expiry_config', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .unique()
    .references(() => households.id),
  yellowDaysBefore: integer('yellow_days_before').notNull().default(7),
  redDaysBefore: integer('red_days_before').notNull().default(2),
  graceDaysAfter: integer('grace_days_after').notNull().default(0),
  // Household-weiter In-App-Schalter fuer den Online-Preis-Abruf (G4). Default AUS.
  priceScrapeEnabled: integer('price_scrape_enabled', { mode: 'boolean' }).notNull().default(false),
});

export const expiryConfigRelations = relations(expiryConfig, ({ one }) => ({
  household: one(households, {
    fields: [expiryConfig.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// stock_targets
// ---------------------------------------------------------------------------

export const stockTargets = sqliteTable(
  'stock_targets',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    targetQuantity: text('target_quantity').notNull(),
    unit: text('unit').notNull().default('piece'),
    minQuantity: text('min_quantity'),
    preferredPlaceId: text('preferred_place_id').references(() => places.id),
    preferredStoreId: text('preferred_store_id').references(() => stores.id),
    notes: text('notes'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    stockTargetHouseholdProductUniq: uniqueIndex('stock_targets_household_product_uniq').on(
      table.householdId,
      table.productId
    ),
  })
);

export const stockTargetsRelations = relations(stockTargets, ({ one }) => ({
  household: one(households, {
    fields: [stockTargets.householdId],
    references: [households.id],
  }),
  product: one(products, {
    fields: [stockTargets.productId],
    references: [products.id],
  }),
  preferredPlace: one(places, {
    fields: [stockTargets.preferredPlaceId],
    references: [places.id],
  }),
  preferredStore: one(stores, {
    fields: [stockTargets.preferredStoreId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// shopping_list_items
// ---------------------------------------------------------------------------

export const shoppingListItems = sqliteTable('shopping_list_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  productId: text('product_id').references(() => products.id),
  freeTextName: text('free_text_name'),
  quantity: text('quantity').notNull().default('1'),
  unit: text('unit').notNull().default('piece'),
  source: text('source')
    .notNull()
    .default('manual')
    .$type<'manual' | 'auto' | 'bring'>(),
  priority: integer('priority').notNull().default(0),
  preferredStoreId: text('preferred_store_id').references(() => stores.id),
  isChecked: integer('is_checked', { mode: 'boolean' }).notNull().default(false),
  checkedAt: integer('checked_at', { mode: 'timestamp_ms' }),
  bringsSyncedAt: integer('bring_synced_at', { mode: 'timestamp_ms' }),
  bringItemUuid: text('bring_item_uuid'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const shoppingListItemsRelations = relations(shoppingListItems, ({ one }) => ({
  household: one(households, {
    fields: [shoppingListItems.householdId],
    references: [households.id],
  }),
  product: one(products, {
    fields: [shoppingListItems.productId],
    references: [products.id],
  }),
  preferredStore: one(stores, {
    fields: [shoppingListItems.preferredStoreId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// shopping_trips — Einkauf-Run (Block E / M2)
//
// Ein konkreter Einkaufsvorgang mit Status. Mehrere Runs parallel moeglich,
// aber hoechstens einer je Haushalt im Status 'begonnen' (partieller Unique-
// Index in der Migration). Positionen (shopping_trip_items) reservieren jeweils
// genau einen Bedarf (shopping_list_item).
// ---------------------------------------------------------------------------

export const shoppingTrips = sqliteTable('shopping_trips', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: text('name'),
  storeId: text('store_id').references(() => stores.id),
  status: text('status')
    .notNull()
    .default('begonnen')
    .$type<'begonnen' | 'pausiert' | 'beendet'>(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const shoppingTripsRelations = relations(shoppingTrips, ({ one, many }) => ({
  household: one(households, {
    fields: [shoppingTrips.householdId],
    references: [households.id],
  }),
  store: one(stores, {
    fields: [shoppingTrips.storeId],
    references: [stores.id],
  }),
  items: many(shoppingTripItems),
}));

// ---------------------------------------------------------------------------
// shopping_trip_items — Position eines Einkauf-Runs (Block E / M2)
//
// Reserviert genau einen Bedarf (shoppingListItemId UNIQUE) → "1 Bedarf = 1 Run".
// product/freeText/quantity/unit sind vom Bedarf denormalisiert, damit die
// Position im Run editierbar ist, ohne den Bedarf zu veraendern. Kein MHD hier —
// der Split (N Bestand-Zeilen mit je eigenem MHD) passiert beim Einbuchen.
// ---------------------------------------------------------------------------

export const shoppingTripItems = sqliteTable('shopping_trip_items', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: text('trip_id')
    .notNull()
    .references(() => shoppingTrips.id, { onDelete: 'cascade' }),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  shoppingListItemId: text('shopping_list_item_id')
    .notNull()
    .references(() => shoppingListItems.id, { onDelete: 'cascade' }),
  productId: text('product_id').references(() => products.id),
  freeTextName: text('free_text_name'),
  quantity: text('quantity').notNull().default('1'),
  unit: text('unit').notNull().default('piece'),
  realStatus: text('real_status')
    .notNull()
    .default('offen')
    .$type<'offen' | 'gekauft' | 'ausverkauft'>(),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // 1 Bedarf = hoechstens 1 Run-Position (Reservierung).
  needUniq: uniqueIndex('shopping_trip_items_need_uniq').on(table.shoppingListItemId),
}));

export const shoppingTripItemsRelations = relations(shoppingTripItems, ({ one }) => ({
  trip: one(shoppingTrips, {
    fields: [shoppingTripItems.tripId],
    references: [shoppingTrips.id],
  }),
  household: one(households, {
    fields: [shoppingTripItems.householdId],
    references: [households.id],
  }),
  shoppingListItem: one(shoppingListItems, {
    fields: [shoppingTripItems.shoppingListItemId],
    references: [shoppingListItems.id],
  }),
  product: one(products, {
    fields: [shoppingTripItems.productId],
    references: [products.id],
  }),
}));

// ---------------------------------------------------------------------------
// bring_sync_log
// ---------------------------------------------------------------------------

export const bringSync = sqliteTable('bring_sync_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  direction: text('direction')
    .notNull()
    .$type<'export' | 'import'>(),
  storeId: text('store_id').references(() => stores.id),
  itemCount: integer('item_count'),
  status: text('status')
    .notNull()
    .$type<'success' | 'partial' | 'failed'>(),
  errorMessage: text('error_message'),
  payload: text('payload', { mode: 'json' }),
  syncedAt: integer('synced_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const bringSyncRelations = relations(bringSync, ({ one }) => ({
  household: one(households, {
    fields: [bringSync.householdId],
    references: [households.id],
  }),
  store: one(stores, {
    fields: [bringSync.storeId],
    references: [stores.id],
  }),
}));

// ---------------------------------------------------------------------------
// audit_log
// ---------------------------------------------------------------------------

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  householdId: text('household_id').references(() => households.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  action: text('action')
    .notNull()
    .$type<'INSERT' | 'UPDATE' | 'DELETE'>(),
  tableName: text('table_name').notNull(),
  recordId: text('record_id').notNull(),
  oldValues: text('old_values', { mode: 'json' }),
  newValues: text('new_values', { mode: 'json' }),
  changedFields: text('changed_fields', { mode: 'json' }).$type<string[]>(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
  household: one(households, {
    fields: [auditLog.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// households
// ---------------------------------------------------------------------------

export const households = sqliteTable('households', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const householdsRelations = relations(households, ({ many }) => ({
  locations: many(locations),
  stores: many(stores),
  inventoryItems: many(inventoryItems),
  expiryConfig: many(expiryConfig),
  stockTargets: many(stockTargets),
  shoppingListItems: many(shoppingListItems),
  bringSync: many(bringSync),
  householdMembers: many(householdMembers),
  units: many(units),
  invites: many(invites),
  productStores: many(productStores),
}));

// ---------------------------------------------------------------------------
// household_members
// ---------------------------------------------------------------------------

export const householdMembers = sqliteTable(
  'household_members',
  {
    id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'),
    joinedAt: integer('joined_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => ({
    householdMembersHouseholdUserUniq: uniqueIndex('household_members_household_user_uniq').on(
      table.householdId,
      table.userId
    ),
  })
);

export const householdMembersRelations = relations(householdMembers, ({ one }) => ({
  household: one(households, {
    fields: [householdMembers.householdId],
    references: [households.id],
  }),
  user: one(users, {
    fields: [householdMembers.userId],
    references: [users.id],
  }),
}));

// ---------------------------------------------------------------------------
// invites
// ---------------------------------------------------------------------------

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  token: text('token').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
});

export const invitesRelations = relations(invites, ({ one }) => ({
  household: one(households, {
    fields: [invites.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// units
// ---------------------------------------------------------------------------

export const units = sqliteTable('units', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  householdId: text('household_id').references(() => households.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  symbol: text('symbol').notNull(),
  // Dimension + Faktor für die Bestands-Aggregation (Umrechnungsschicht).
  // count-artige Einheiten (Stück/Packung/…) sind nicht ineinander umrechenbar.
  dimension: text('dimension')
    .notNull()
    .default('count')
    .$type<'mass' | 'volume' | 'count'>(),
  toBaseFactor: text('to_base_factor').notNull().default('1'),
  sortOrder: integer('sort_order').notNull().default(0),
  isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
});

export const unitsRelations = relations(units, ({ one }) => ({
  household: one(households, {
    fields: [units.householdId],
    references: [households.id],
  }),
}));

// ---------------------------------------------------------------------------
// Better Auth tables (sessions, accounts, verifications)
// IDs are text — Better Auth convention
// ---------------------------------------------------------------------------

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
});

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// meta (App-only)
// ---------------------------------------------------------------------------
// App-lokale Guard-/Settings-Tabelle. Hat KEIN Postgres-Gegenstueck (der Pi
// braucht sie nicht) und ist daher vom Schema-Parity-Test ausgenommen.
// Genutzt fuer: First-Launch-Seeding-Guard (schema_version, seeded_at) und
// die spaeteren Sync-Einstellungen (fuehrendes System, Pi-URL) als Key/Value.

export const meta = sqliteTable('meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
});
