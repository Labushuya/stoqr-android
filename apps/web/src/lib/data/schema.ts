// ---------------------------------------------------------------------------
// Schema-Provider (Dual-Target) — spiegelt getDb() fuer die Tabellen-Objekte
// ---------------------------------------------------------------------------
// Problem: die geteilten Query-Module ($data/queries/*) importierten ihre
// drizzle-Tabellen-Objekte bisher hart aus dem Postgres-Barrel '@stoqr/db'.
// getDb() ($data/db.ts) schaltet zwar die DB-CONNECTION um (Pi=Postgres,
// App=SQLite via setDb()), aber die Tabellen-METADATEN blieben Postgres. Damit
// serialisiert drizzle beim INSERT die Postgres-Defaults (uuid().defaultRandom()
// -> gen_random_uuid(), timestamp().defaultNow() -> now()) in SQL, das die
// On-Device-SQLite ablehnt -> praktisch alle Schreib-Mutationen scheiterten.
//
// Loesung analog zu getDb(): ein Provider, der per Default die Postgres-Tabellen
// liefert (Pi unveraendert) und im App-Boot via setSchema(sqliteSchema) auf die
// SQLite-Tabellen umgestellt wird. Die Query-Module importieren ihre Tabellen ab
// jetzt aus '$data/schema' statt '@stoqr/db'.
//
// TYP-VERTRAG: Jede exportierte Tabelle ist STATISCH als der Postgres-Typ
// getypt (typeof pg.<table>). So bleiben `typeof categories.$inferSelect` und
// alle 157 Aufrufstellen exakt wie zuvor — auf dem Pi ist Laufzeit == Compile-
// zeit (null Aenderung). Im App-Target liefert der Proxy zur LAUFZEIT die
// strukturgleiche SQLite-Tabelle; drizzle liest von einem Tabellen-Objekt nur
// Properties (Spalten + Symbol-Keys) und vergleicht es nie per Identitaet, daher
// ist der Weiterleitungs-Proxy transparent.

import * as pg from '@stoqr/db'

// Aktiver Schema-Namespace. Default: Postgres (Pi). App-Boot ruft setSchema().
// Als `typeof pg` getypt, damit die Struktur (Tabellennamen) fest steht.
let active: typeof pg = pg

/**
 * Setzt den aktiven Schema-Namespace (App-Target: sqliteSchema). Muss VOR der
 * ersten Query aufgerufen werden (boot.app.ts, vor setDb()). Auf dem Pi nie
 * aufgerufen -> es bleibt bei den Postgres-Tabellen.
 */
export function setSchema(schema: typeof pg): void {
  active = schema
}

// Einen transparenten Weiterleitungs-Proxy fuer EIN Tabellen-Objekt bauen. Der
// Proxy loest jeden Zugriff (inkl. Symbol-Keys, die drizzle intern nutzt) live
// gegen active[name] auf, sodass ein spaeteres setSchema() sofort greift.
// Einen transparenten Weiterleitungs-Proxy fuer EIN Tabellen-Objekt bauen. Der
// Proxy-TARGET ist die echte PG-Tabelle (so bestehen drizzle-interne is()/
// Prototyp-Pruefungen nativ); der get-Trap leitet jeden Zugriff live auf
// active[name] um, damit ein spaeteres setSchema() sofort greift. Ohne echten
// Target als Basis identifiziert drizzle das Objekt nicht als Table und
// getSQL() rekursiert (Maximum call stack).
function tableProxy<K extends keyof typeof pg>(name: K): (typeof pg)[K] {
  return new Proxy(pg[name] as object, {
    get: (_t, prop) => Reflect.get(active[name] as object, prop),
  }) as (typeof pg)[K]
}

// Die von $data/queries/* genutzten Tabellen. Statisch PG-getypt, Laufzeit-Wert
// folgt active (Pi=pg, App=sqliteSchema).
export const auditLog = tableProxy('auditLog')
export const bringSync = tableProxy('bringSync')
export const categories = tableProxy('categories')
export const categoryMappings = tableProxy('categoryMappings')
export const expiryConfig = tableProxy('expiryConfig')
export const globusSnapshots = tableProxy('globusSnapshots')
export const householdMembers = tableProxy('householdMembers')
export const households = tableProxy('households')
export const inventoryItems = tableProxy('inventoryItems')
export const invites = tableProxy('invites')
export const locations = tableProxy('locations')
export const nutrientTypes = tableProxy('nutrientTypes')
export const places = tableProxy('places')
export const productFieldSources = tableProxy('productFieldSources')
export const productNutrients = tableProxy('productNutrients')
export const productPrices = tableProxy('productPrices')
export const productStores = tableProxy('productStores')
export const products = tableProxy('products')
export const shoppingListItems = tableProxy('shoppingListItems')
export const shoppingTripItems = tableProxy('shoppingTripItems')
export const shoppingTrips = tableProxy('shoppingTrips')
export const stockTargets = tableProxy('stockTargets')
export const storages = tableProxy('storages')
export const stores = tableProxy('stores')
export const units = tableProxy('units')
export const users = tableProxy('users')
