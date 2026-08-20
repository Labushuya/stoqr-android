// ---------------------------------------------------------------------------
// make-sqlite-db — gemeinsame Test-Harness (node:sqlite + drizzle sqlite-proxy)
// ---------------------------------------------------------------------------
// Baut eine In-Memory-SQLite exakt wie der App-Boot: DDL aus getSqliteDdl(),
// ein Executor der die sqlite-proxy-Row-Shape-Regeln von boot.app.ts spiegelt
// (get -> flache Zeile; all/values -> Array-of-Arrays; boolean->0/1;
// undefined->null, weil node:sqlite JS-Booleans/undefined nicht bindet). Dazu
// ein `seenSql`-Recorder, damit Tests pruefen koennen, dass KEIN Postgres-SQL
// (gen_random_uuid()/now()) die SQLite erreicht.

import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import { getSqliteDdl, sqliteSchema } from '@stoqr/db/sqlite'

export type MadeDb = {
  sqlite: DatabaseSync
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
  seenSql: string[]
}

export function makeSqliteDb(): MadeDb {
  const sqlite = new DatabaseSync(':memory:')
  const seenSql: string[] = []

  const exec = async (sql: string, params: unknown[], method: string) => {
    seenSql.push(sql)
    const p = ((params ?? []) as unknown[]).map((v) =>
      typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v,
    ) as never[]
    if (method === 'run') {
      sqlite.prepare(sql).run(...p)
      return { rows: [] as unknown[] }
    }
    const objRows = sqlite.prepare(sql).all(...p) as Array<Record<string, unknown>>
    const mapped = objRows.map((r) => Object.values(r))
    return { rows: method === 'get' ? mapped[0] : mapped }
  }

  // schema: sqliteSchema, damit db.query.* (relationale Fns wie getCategoryById)
  // funktionieren — genau wie createSqliteDb() im App-Boot.
  const db = drizzle(exec as never, { schema: sqliteSchema })
  for (const stmt of getSqliteDdl()) sqlite.prepare(stmt).run()
  return { sqlite, db, seenSql }
}

/** true, wenn irgendein abgesetztes SQL Postgres-Defaults enthaelt. */
export function sawPostgresSql(seen: string[]): boolean {
  return seen.some((s) => /gen_random_uuid|(?<![_a-z])now\(\)/i.test(s))
}
