import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// Lazy-Singleton: die Postgres-Verbindung wird ERST beim ersten Zugriff auf `db`
// aufgebaut, nicht schon beim Import dieses Moduls. Grund: der App-Target-Build
// (adapter-static faehrt einen SSR-Shell-Pass) zieht dieses Modul transitiv in
// den Graph, obwohl die App den Postgres-Client nie nutzt. Waere die Verbindung
// ein Import-Seiteneffekt (wie zuvor `const client = postgres(...)` auf Modul-
// ebene), braeche der Build bzw. der postgres-Stub wuerfe beim Bauen.
// Auf dem Pi ist das Verhalten unveraendert: die Verbindung entsteht beim ersten
// DB-Zugriff im Request statt beim Prozessstart — funktional identisch.
type Drizzle = ReturnType<typeof drizzle<typeof schema>>

let _db: Drizzle | null = null

function connect(): Drizzle {
  const connectionString = process.env.DATABASE_URL!
  const client = postgres(connectionString, { max: 10 })
  return drizzle(client, { schema })
}

// Proxy leitet jeden Property-Zugriff/Aufruf auf die lazy erzeugte echte
// Drizzle-Instanz um. Merely `import { db }` loest KEINE Verbindung aus.
export const db = new Proxy({} as Drizzle, {
  get(_t, prop, receiver) {
    if (_db === null) _db = connect()
    return Reflect.get(_db, prop, receiver)
  },
  apply(_t, thisArg, args) {
    if (_db === null) _db = connect()
    return Reflect.apply(_db as unknown as (...a: unknown[]) => unknown, thisArg, args)
  },
}) as Drizzle

export type Database = Drizzle
