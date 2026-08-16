import { getDb } from '$data/db'
import { auditLog, users } from '@stoqr/db'
import { and, desc, eq } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Audit-Log (Block D): vollstaendige Nachvollziehbarkeit aller Mutationen.
//
// writeAudit() wird in die Mutations-Pfade eingehaengt. Es ist bewusst
// "best effort": ein Fehler beim Schreiben des Logs darf die eigentliche
// Mutation NICHT scheitern lassen (try/catch + console.error).
// ---------------------------------------------------------------------------

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'

export interface WriteAuditInput {
  householdId: string | null
  userId: string | null
  action: AuditAction
  tableName: string
  recordId: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  /** Wenn nicht gesetzt, wird es bei UPDATE aus old/new berechnet. */
  changedFields?: string[]
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * Ermittelt geaenderte Felder durch flachen Vergleich von old/new.
 * Werte werden per JSON-Stringify verglichen (deckt primitive + einfache
 * Objekte/Arrays ab). Nur Schluessel aus beiden Objekten werden betrachtet.
 */
export function diffFields(
  oldValues?: Record<string, unknown> | null,
  newValues?: Record<string, unknown> | null,
): string[] {
  if (!oldValues || !newValues) return []
  const keys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)])
  const changed: string[] = []
  for (const k of keys) {
    if (JSON.stringify(oldValues[k]) !== JSON.stringify(newValues[k])) changed.push(k)
  }
  return changed
}

/**
 * Schreibt einen Audit-Eintrag. Best-effort: Fehler werden geloggt, aber nicht
 * weitergeworfen, damit die ausloesende Mutation nicht scheitert.
 */
export async function writeAudit(input: WriteAuditInput): Promise<void> {
  const db = getDb()
  try {
    const changedFields =
      input.changedFields ??
      (input.action === 'UPDATE' ? diffFields(input.oldValues, input.newValues) : undefined)

    await db.insert(auditLog).values({
      householdId: input.householdId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      tableName: input.tableName,
      recordId: input.recordId,
      oldValues: input.oldValues ?? null,
      newValues: input.newValues ?? null,
      changedFields,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    })
  } catch (err) {
    console.error('[writeAudit] konnte Audit-Eintrag nicht schreiben:', err)
  }
}

// ---------------------------------------------------------------------------
// Aktivitaets-Ansicht: chronologische Log-Liste je Haushalt.
// ---------------------------------------------------------------------------

export interface AuditEntry {
  id: string
  action: AuditAction
  tableName: string
  recordId: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  changedFields: string[] | null
  createdAt: Date
  userId: string | null
  userName: string | null
}

/**
 * Liefert die letzten Audit-Eintraege eines Haushalts, neueste zuerst.
 * Optional gefiltert nach tableName.
 */
export async function listAuditLog(
  householdId: string,
  opts?: { limit?: number; tableName?: string },
): Promise<AuditEntry[]> {
  const db = getDb()
  const limit = Math.min(Math.max(opts?.limit ?? 100, 1), 500)

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      tableName: auditLog.tableName,
      recordId: auditLog.recordId,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
      changedFields: auditLog.changedFields,
      createdAt: auditLog.createdAt,
      userId: auditLog.userId,
      userDisplayName: users.displayName,
      userUsername: users.username,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.userId, users.id))
    .where(
      opts?.tableName
        ? and(eq(auditLog.householdId, householdId), eq(auditLog.tableName, opts.tableName))
        : eq(auditLog.householdId, householdId),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(limit)

  return rows.map((r) => ({
    id: r.id.toString(),
    action: r.action,
    tableName: r.tableName,
    recordId: r.recordId,
    oldValues: r.oldValues as Record<string, unknown> | null,
    newValues: r.newValues as Record<string, unknown> | null,
    changedFields: r.changedFields,
    createdAt: r.createdAt,
    userId: r.userId,
    userName: r.userDisplayName ?? r.userUsername ?? null,
  }))
}
