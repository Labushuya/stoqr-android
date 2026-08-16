// ---------------------------------------------------------------------------
// DB-Fehler-Helfer
//
// drizzle-orm 0.45.x wrappt Query-Fehler in einen DrizzleQueryError und hängt
// den originalen Postgres-Fehler (mit SQLSTATE-`code`) unter `.cause` an. Ältere
// Versionen (0.38.x) reichen den rohen Fehler mit top-level `.code` durch.
// Diese Helfer laufen die `cause`-Kette ab, damit die Erkennung versionsrobust ist.
// ---------------------------------------------------------------------------

/** Findet den SQLSTATE-`code` in err oder einer verschachtelten `cause`-Kette. */
export function getPgErrorCode(err: unknown): string | undefined {
  let cur: unknown = err
  // Kette begrenzen, um bei zyklischen causes nicht zu hängen.
  for (let depth = 0; cur && typeof cur === 'object' && depth < 5; depth++) {
    const code = (cur as { code?: unknown }).code
    if (typeof code === 'string') return code
    cur = (cur as { cause?: unknown }).cause
  }
  return undefined
}

/** true, wenn der Fehler ein Unique-Constraint-Verstoß ist (SQLSTATE 23505). */
export function isUniqueViolation(err: unknown): boolean {
  return getPgErrorCode(err) === '23505'
}
