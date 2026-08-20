import { describe, it, expect } from 'vitest'
import { inArray } from 'drizzle-orm'
import { sqliteSchema } from '@stoqr/db/sqlite'
import { makeSqliteDb } from './test-support/make-sqlite-db'

// Spiegelt die routeApp settings/sync meta-Upsert-Logik (der Router importiert
// $app/$data und laedt im rohen Vitest nicht; die DB-Operation ist der Kern).
// Regression fuer ROOT C: Sync-Card "Speichern" warf "Not found".

const M = sqliteSchema.meta

async function readSync(db: ReturnType<typeof makeSqliteDb>['db']) {
  const rows = await db
    .select({ key: M.key, value: M.value })
    .from(M)
    .where(inArray(M.key, ['sync.leader', 'sync.piUrl']))
  const map = new Map(rows.map((x: { key: string; value: string | null }) => [x.key, x.value]))
  return { leader: map.get('sync.leader') === 'pi' ? 'pi' : 'app', piUrl: map.get('sync.piUrl') ?? '' }
}

async function writeSync(db: ReturnType<typeof makeSqliteDb>['db'], leader: string, piUrl: string) {
  const upsert = async (key: string, value: string) => {
    await db.insert(M).values({ key, value }).onConflictDoUpdate({ target: M.key, set: { value, updatedAt: new Date() } })
  }
  await upsert('sync.leader', leader)
  await upsert('sync.piUrl', piUrl)
}

describe('App settings/sync meta-Upsert (ROOT C)', () => {
  it('Default ohne Zeilen: leader=app, piUrl leer', async () => {
    const { db } = makeSqliteDb()
    expect(await readSync(db)).toEqual({ leader: 'app', piUrl: '' })
  })

  it('speichert + liest zurueck, idempotent', async () => {
    const { db } = makeSqliteDb()
    await writeSync(db, 'pi', 'http://pi.local:3000')
    expect(await readSync(db)).toEqual({ leader: 'pi', piUrl: 'http://pi.local:3000' })
    // zweiter Write (on conflict update)
    await writeSync(db, 'app', '')
    expect(await readSync(db)).toEqual({ leader: 'app', piUrl: '' })
  })
})
