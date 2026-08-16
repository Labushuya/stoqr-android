import { describe, it, expect } from 'vitest'
import { buildCategoryTree, isDescendant, categoryDepth, type CatNode } from './category-tree'

// Getraenke > Wasser > Sprudel ; Milchprodukte > Joghurt ; Sonstiges (flach)
const N = (id: string, name: string, parentId: string | null, sortOrder = 0): CatNode => ({
  id, name, icon: null, parentId, sortOrder,
})
const LIST: CatNode[] = [
  N('getraenke', 'Getränke', null, 1),
  N('wasser', 'Wasser', 'getraenke', 0),
  N('sprudel', 'Sprudel', 'wasser', 0),
  N('milch', 'Milchprodukte', null, 0),
  N('joghurt', 'Joghurt', 'milch', 0),
  N('sonstiges', 'Sonstiges', null, 2),
]

describe('buildCategoryTree', () => {
  it('DFS-Reihenfolge mit korrekter Tiefe', () => {
    const t = buildCategoryTree(LIST)
    expect(t.map((n) => `${n.depth}:${n.id}`)).toEqual([
      '0:milch', '1:joghurt',
      '0:getraenke', '1:wasser', '2:sprudel',
      '0:sonstiges',
    ])
  })

  it('enthaelt alle Knoten', () => {
    expect(buildCategoryTree(LIST)).toHaveLength(LIST.length)
  })

  it('verwaister parentId → als Wurzel', () => {
    const t = buildCategoryTree([N('a', 'A', 'nonexistent', 0)])
    expect(t).toHaveLength(1)
    expect(t[0].depth).toBe(0)
  })

  it('reiner Zyklus stuerzt nicht ab und gibt alle Knoten aus', () => {
    const cyc = [N('x', 'X', 'y', 0), N('y', 'Y', 'x', 0)]
    const t = buildCategoryTree(cyc)
    expect(t).toHaveLength(2)
  })
})

describe('isDescendant', () => {
  const L = LIST
  it('self zaehlt als descendant (verbietet parent=self)', () => {
    expect(isDescendant(L, 'getraenke', 'getraenke')).toBe(true)
  })
  it('direktes Kind', () => {
    expect(isDescendant(L, 'wasser', 'getraenke')).toBe(true)
  })
  it('Enkel', () => {
    expect(isDescendant(L, 'sprudel', 'getraenke')).toBe(true)
  })
  it('Nicht-Verwandter ist kein descendant', () => {
    expect(isDescendant(L, 'joghurt', 'getraenke')).toBe(false)
  })
  it('null candidate → false', () => {
    expect(isDescendant(L, null, 'getraenke')).toBe(false)
  })
  it('robust gegen bestehenden Zyklus', () => {
    const cyc = [N('x', 'X', 'y', 0), N('y', 'Y', 'x', 0)]
    expect(isDescendant(cyc, 'x', 'z')).toBe(false) // terminiert
  })
})

describe('categoryDepth', () => {
  it('Wurzel = 0, Kind = 1, Enkel = 2', () => {
    expect(categoryDepth(LIST, 'getraenke')).toBe(0)
    expect(categoryDepth(LIST, 'wasser')).toBe(1)
    expect(categoryDepth(LIST, 'sprudel')).toBe(2)
  })
})
