import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { resolveMediaPath } from './media-path'

const BASE = '/data/media'

describe('resolveMediaPath', () => {
  it('loest einen normalen relativen Pfad auf (innerhalb baseDir)', () => {
    expect(resolveMediaPath('hh1/4306188415978.jpg', BASE)).toBe(resolve(BASE, 'hh1/4306188415978.jpg'))
  })
  it('erlaubt den Basis-Ordner selbst', () => {
    expect(resolveMediaPath('.', BASE)).toBe(resolve(BASE))
  })
  it('blockt Path-Traversal (..)', () => {
    expect(resolveMediaPath('../etc/passwd', BASE)).toBeNull()
    expect(resolveMediaPath('hh1/../../secret', BASE)).toBeNull()
  })
  it('blockt Null-Byte + leer', () => {
    expect(resolveMediaPath('hh1/\0.jpg', BASE)).toBeNull()
    expect(resolveMediaPath('', BASE)).toBeNull()
    expect(resolveMediaPath('   ', BASE)).toBeNull()
  })
})
