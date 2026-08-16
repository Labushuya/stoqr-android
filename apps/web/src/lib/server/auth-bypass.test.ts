import { describe, it, expect } from 'vitest'
import { rowToBypassUser, makeBypassSession } from './auth-bypass-transform'

// Testet die reine Bypass-Logik ohne DB: Zeile→User-Transformation und die
// Session-Erzeugung. Deckt genau die Regeln ab, die stimmen müssen, damit der
// Hook bei AUTH_DISABLED=true eine gültige Identität injiziert.

const baseRow = {
  id: 'user_abc',
  displayName: 'Christopher',
  email: 'chris@fam.ily',
  emailVerified: true,
  image: null,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-06-01T00:00:00Z'),
}

describe('rowToBypassUser', () => {
  it('mappt displayName auf name und übernimmt Kernfelder', () => {
    const u = rowToBypassUser(baseRow)
    expect(u.id).toBe('user_abc')
    expect(u.name).toBe('Christopher')
    expect(u.email).toBe('chris@fam.ily')
    expect(u.emailVerified).toBe(true)
  })

  it('fällt für name auf email zurück, wenn displayName null ist', () => {
    const u = rowToBypassUser({ ...baseRow, displayName: null })
    expect(u.name).toBe('chris@fam.ily')
  })

  it('fällt für name auf id zurück, wenn displayName und email null sind', () => {
    const u = rowToBypassUser({ ...baseRow, displayName: null, email: null })
    expect(u.name).toBe('user_abc')
    // email darf nie null/undefined sein (Better-Auth User erwartet string)
    expect(u.email).toBe('')
  })
})

describe('makeBypassSession', () => {
  it('erzeugt eine typkonforme Session, die auf den Nutzer verweist und nicht abgelaufen ist', () => {
    const u = rowToBypassUser(baseRow)
    const s = makeBypassSession(u)
    expect(s.userId).toBe('user_abc')
    expect(s.token).toBeTruthy()
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})
