import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  numeric,
  date,
  timestamp,
  jsonb,
  bigserial,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  // stoqr-internal field, not managed by Better Auth.
  // Nullable so Better Auth signup (which doesn't provide username) works out of the box.
  username: varchar('username', { length: 64 }).unique(),
  displayName: varchar('display_name', { length: 128 }),
  email: varchar('email', { length: 255 }).unique(),
  // Better Auth required fields
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  locale: varchar('locale', { length: 10 }).notNull().default('de-DE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  auditLog: many(auditLog),
  createdProducts: many(products, { relationName: 'productCreator' }),
}));

// ---------------------------------------------------------------------------
// locations
// ---------------------------------------------------------------------------

export const locations = pgTable('locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: varchar('name', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const storages = pgTable('storages', {
  id: uuid('id').primaryKey().defaultRandom(),
  locationId: uuid('location_id')
    .notNull()
    .references(() => locations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  storageType: varchar('storage_type', { length: 32 }).$type<
    'fridge' | 'freezer' | 'shelf' | 'cabinet' | 'other'
  >(),
  temperatureZone: varchar('temperature_zone', { length: 16 }).$type<
    'ambient' | 'chilled' | 'frozen'
  >(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const places = pgTable('places', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageId: uuid('storage_id')
    .notNull()
    .references(() => storages.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 128 }).notNull(),
  icon: varchar('icon', { length: 64 }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
  name: varchar('name', { length: 128 }).notNull(),
  slug: varchar('slug', { length: 128 }).notNull().unique(),
  icon: varchar('icon', { length: 64 }),
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

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  gtin: varchar('gtin', { length: 14 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  brand: varchar('brand', { length: 128 }),
  categoryId: uuid('category_id').references(() => categories.id),
  description: text('description'),
  notes: text('notes'),
  imageUrl: text('image_url'),
  defaultUnit: varchar('default_unit', { length: 16 }).notNull().default('piece'),
  defaultQuantity: numeric('default_quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  defaultWeightG: numeric('default_weight_g', { precision: 10, scale: 2 }),
  defaultVolumeMl: numeric('default_volume_ml', { precision: 10, scale: 2 }),
  offData: jsonb('off_data'),
  offFetchedAt: timestamp('off_fetched_at'),
  isVerified: boolean('is_verified').notNull().default(false),
  expiryToleranceDays: integer('expiry_tolerance_days'),
  bringItemId: varchar('bring_item_id', { length: 128 }),
  // Pfand (G47): has_deposit = Artikel bedarf Pfand; deposit_ct = Betrag in Cent
  // (nullable — nur wenn bekannt). Pfand ist EAN-Eigenschaft (Artikel-Ebene).
  hasDeposit: boolean('has_deposit').notNull().default(false),
  depositCt: integer('deposit_ct'),
  createdBy: text('created_by').references(() => users.id, { relationName: 'productCreator' } as any),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const productStores = pgTable(
  'product_stores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const productPrices = pgTable(
  'product_prices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    priceCt: integer('price_ct').notNull(),
    unit: varchar('unit', { length: 16 }).notNull(),
    // Grundpreis (PAngV, G44): gesetzlich ausgezeichneter Preis je Basiseinheit,
    // z.B. 19 Cent / 'l'. Aus dem Globus-Suggest-HTML (reference-price). Nullable:
    // nicht jeder Artikel/Markt zeichnet einen Grundpreis aus.
    basePriceCt: integer('base_price_ct'),
    basePriceUnit: varchar('base_price_unit', { length: 16 }),
    isReduced: boolean('is_reduced').notNull().default(false),
    // G47: true = der Preis (priceCt) enthält das Pfand bereits → nicht zusätzlich
    // addieren; false (Default) = zzgl. Pfand (products.deposit_ct je Stück).
    priceIncludesDeposit: boolean('price_includes_deposit').notNull().default(false),
    isCurrent: boolean('is_current').notNull().default(false),
    // Freigabe-Status: 'proposed' = Online-Vorschlag (Staging, nie is_current),
    // 'confirmed' = vom User bestaetigt/maßgeblich, 'rejected' = verworfen (Historie).
    // Kern-Invariante: status != 'confirmed' => is_current = false.
    status: varchar('status', { length: 16 })
      .notNull()
      .default('confirmed')
      .$type<'proposed' | 'confirmed' | 'rejected'>(),
    source: varchar('source', { length: 16 }).notNull().$type<'manual' | 'booked' | 'online'>(),
    note: text('note'),
    recordedAt: timestamp('recorded_at').notNull().defaultNow(),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const globusSnapshots = pgTable(
  'globus_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'set null' }),
    storeId: uuid('store_id').references(() => stores.id, { onDelete: 'set null' }),
    gtin: varchar('gtin', { length: 14 }).notNull(),
    name: varchar('name', { length: 255 }),
    category: text('category').array(),
    priceCt: integer('price_ct'), // nullable: preislose Treffer erlaubt
    currency: varchar('currency', { length: 8 }),
    imageRemoteUrl: text('image_remote_url'),
    localImagePath: text('local_image_path'), // Pfad im MEDIA_DIR; null wenn kein Bild
    rawJson: jsonb('raw_json').notNull(),
    // G44: vollstaendiges Detailseiten-HTML (Roh-Archiv) + strukturierte Feld-Landkarte
    // dieses Abrufs ({ field, value, source, belongsTo }[]) — dokumentiert, welcher
    // Wert woher kam. Beide nullable (Detailseite best-effort).
    rawDetailHtml: text('raw_detail_html'),
    extracted: jsonb('extracted'),
    status: varchar('status', { length: 16 })
      .notNull()
      .default('proposed')
      .$type<'proposed' | 'confirmed' | 'rejected'>(),
    source: varchar('source', { length: 16 }).notNull().default('globus').$type<'globus'>(),
    fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    createdBy: text('created_by').references(() => users.id),
    createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const nutrientTypes = pgTable('nutrient_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: varchar('slug', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  unit: varchar('unit', { length: 16 }).notNull(),
  parentId: uuid('parent_id').references((): AnyPgColumn => nutrientTypes.id),
  sortOrder: integer('sort_order').notNull().default(0),
  offKey: varchar('off_key', { length: 64 }),
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

export const productNutrients = pgTable(
  'product_nutrients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    nutrientTypeId: uuid('nutrient_type_id')
      .notNull()
      .references(() => nutrientTypes.id),
    valuePer100: numeric('value_per_100', { precision: 10, scale: 4 }).notNull(),
    source: varchar('source', { length: 16 }).notNull().default('off'),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const productFieldSources = pgTable(
  'product_field_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    field: varchar('field', { length: 24 }).notNull(),
    source: varchar('source', { length: 16 }).notNull().$type<'off' | 'globus' | 'manual'>(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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
export const categoryMappings = pgTable(
  'category_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 8 }).notNull().$type<'off' | 'globus'>(),
    token: text('token').notNull(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const stores = pgTable('stores', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: varchar('name', { length: 128 }).notNull(),
  chain: varchar('chain', { length: 64 }),
  address: text('address'),
  city: varchar('city', { length: 128 }),
  latitude: numeric('latitude', { precision: 9, scale: 6 }),
  longitude: numeric('longitude', { precision: 9, scale: 6 }),
  bringListUuid: varchar('bring_list_uuid', { length: 128 }),
  // Abruf-URL-Vorlage fuer den Online-Preis-Abruf. Enthaelt optional {EAN},
  // das beim Abruf durch die Artikel-GTIN ersetzt wird (z.B. Globus-Suggest:
  // https://produkte.globus.de/hockenheim/suggest?search={EAN}). Leer = kein Abruf.
  scrapeUrl: text('scrape_url'),
  isFavorite: boolean('is_favorite').notNull().default(false),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const inventoryItems = pgTable('inventory_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id),
  placeId: uuid('place_id').references(() => places.id),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  // EAN/Barcode dieses konkreten Bestands (nicht des Artikels — siehe ROADMAP).
  gtin: varchar('gtin', { length: 14 }),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: varchar('unit', { length: 16 }).notNull().default('piece'),
  weightG: numeric('weight_g', { precision: 10, scale: 2 }),
  volumeMl: numeric('volume_ml', { precision: 10, scale: 2 }),
  bestBeforeDate: date('best_before_date'),
  openedAt: timestamp('opened_at'),
  openedExpiryDays: integer('opened_expiry_days'),
  purchaseDate: date('purchase_date'),
  purchasePriceCt: integer('purchase_price_ct'),
  storeId: uuid('store_id').references(() => stores.id),
  lotNumber: varchar('lot_number', { length: 64 }),
  notes: text('notes'),
  status: varchar('status', { length: 16 })
    .notNull()
    .default('available')
    .$type<'available' | 'consumed' | 'expired' | 'donated' | 'discarded'>(),
  consumedAt: timestamp('consumed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const expiryConfig = pgTable('expiry_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .unique()
    .references(() => households.id),
  yellowDaysBefore: integer('yellow_days_before').notNull().default(7),
  redDaysBefore: integer('red_days_before').notNull().default(2),
  graceDaysAfter: integer('grace_days_after').notNull().default(0),
  // Household-weiter In-App-Schalter fuer den Online-Preis-Abruf (G4). Default AUS.
  priceScrapeEnabled: boolean('price_scrape_enabled').notNull().default(false),
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

export const stockTargets = pgTable(
  'stock_targets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    targetQuantity: numeric('target_quantity', { precision: 10, scale: 3 }).notNull(),
    unit: varchar('unit', { length: 16 }).notNull().default('piece'),
    minQuantity: numeric('min_quantity', { precision: 10, scale: 3 }),
    preferredPlaceId: uuid('preferred_place_id').references(() => places.id),
    preferredStoreId: uuid('preferred_store_id').references(() => stores.id),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const shoppingListItems = pgTable('shopping_list_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  productId: uuid('product_id').references(() => products.id),
  freeTextName: varchar('free_text_name', { length: 255 }),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: varchar('unit', { length: 16 }).notNull().default('piece'),
  source: varchar('source', { length: 16 })
    .notNull()
    .default('manual')
    .$type<'manual' | 'auto' | 'bring'>(),
  priority: integer('priority').notNull().default(0),
  preferredStoreId: uuid('preferred_store_id').references(() => stores.id),
  isChecked: boolean('is_checked').notNull().default(false),
  checkedAt: timestamp('checked_at'),
  bringsSyncedAt: timestamp('bring_synced_at'),
  bringItemUuid: varchar('bring_item_uuid', { length: 128 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const shoppingTrips = pgTable('shopping_trips', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  name: varchar('name', { length: 128 }),
  storeId: uuid('store_id').references(() => stores.id),
  status: varchar('status', { length: 16 })
    .notNull()
    .default('begonnen')
    .$type<'begonnen' | 'pausiert' | 'beendet'>(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  endedAt: timestamp('ended_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const shoppingTripItems = pgTable('shopping_trip_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tripId: uuid('trip_id')
    .notNull()
    .references(() => shoppingTrips.id, { onDelete: 'cascade' }),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  shoppingListItemId: uuid('shopping_list_item_id')
    .notNull()
    .references(() => shoppingListItems.id, { onDelete: 'cascade' }),
  productId: uuid('product_id').references(() => products.id),
  freeTextName: varchar('free_text_name', { length: 255 }),
  quantity: numeric('quantity', { precision: 10, scale: 3 }).notNull().default('1'),
  unit: varchar('unit', { length: 16 }).notNull().default('piece'),
  realStatus: varchar('real_status', { length: 16 })
    .notNull()
    .default('offen')
    .$type<'offen' | 'gekauft' | 'ausverkauft'>(),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
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

export const bringSync = pgTable('bring_sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id),
  direction: varchar('direction', { length: 8 })
    .notNull()
    .$type<'export' | 'import'>(),
  storeId: uuid('store_id').references(() => stores.id),
  itemCount: integer('item_count'),
  status: varchar('status', { length: 16 })
    .notNull()
    .$type<'success' | 'partial' | 'failed'>(),
  errorMessage: text('error_message'),
  payload: jsonb('payload'),
  syncedAt: timestamp('synced_at').notNull().default(sql`now()`),
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

export const auditLog = pgTable('audit_log', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  householdId: text('household_id').references(() => households.id, { onDelete: 'cascade' }),
  userId: text('user_id').references(() => users.id),
  action: varchar('action', { length: 16 })
    .notNull()
    .$type<'INSERT' | 'UPDATE' | 'DELETE'>(),
  tableName: varchar('table_name', { length: 64 }).notNull(),
  recordId: uuid('record_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  changedFields: text('changed_fields').array(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
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

export const households = pgTable('households', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 128 }).notNull(),
  createdBy: text('created_by').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
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

export const householdMembers = pgTable(
  'household_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: text('household_id')
      .notNull()
      .references(() => households.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 16 }).notNull().default('member'),
    joinedAt: timestamp('joined_at').notNull().defaultNow(),
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

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id')
    .notNull()
    .references(() => households.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull(),
  token: text('token').notNull().unique(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
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

export const units = pgTable('units', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: text('household_id').references(() => households.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 32 }).notNull(),
  symbol: varchar('symbol', { length: 8 }).notNull(),
  // Dimension + Faktor für die Bestands-Aggregation (Umrechnungsschicht).
  // count-artige Einheiten (Stück/Packung/…) sind nicht ineinander umrechenbar.
  dimension: varchar('dimension', { length: 8 })
    .notNull()
    .default('count')
    .$type<'mass' | 'volume' | 'count'>(),
  toBaseFactor: numeric('to_base_factor', { precision: 12, scale: 4 }).notNull().default('1'),
  sortOrder: integer('sort_order').notNull().default(0),
  isSystem: boolean('is_system').notNull().default(false),
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

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
});

export const accounts = pgTable('accounts', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().default(sql`now()`),
  updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
});

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').default(sql`now()`),
  updatedAt: timestamp('updated_at').default(sql`now()`),
});
