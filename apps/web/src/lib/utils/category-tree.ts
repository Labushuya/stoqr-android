// DB-freie Hierarchie-Helfer fuer Kategorien (G27 Nesting). Rein funktional,
// unit-testbar (analog category-slug.ts). Kein Drizzle/DB-Import.

export type CatNode = {
  id: string
  name: string
  icon: string | null
  parentId: string | null
  sortOrder: number
}

export type TreeNode<T extends CatNode> = T & { depth: number }

/**
 * Flache Liste → geordnete flache Liste mit `depth` je Eintrag (DFS).
 * Wurzeln (parentId null ODER Parent nicht in der Liste = verwaist) zuerst,
 * je Ebene nach sortOrder dann name. Robust gegen Zyklen (Besuchsschutz):
 * bereits besuchte Knoten werden nicht erneut ausgegeben.
 */
export function buildCategoryTree<T extends CatNode>(list: T[]): TreeNode<T>[] {
  const byId = new Map(list.map((c) => [c.id, c]))
  const childrenOf = new Map<string | null, T[]>()
  for (const c of list) {
    // Verwaister parentId (Parent fehlt) → als Wurzel behandeln.
    const key = c.parentId && byId.has(c.parentId) ? c.parentId : null
    const arr = childrenOf.get(key)
    if (arr) arr.push(c)
    else childrenOf.set(key, [c])
  }
  const cmp = (a: T, b: T) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  for (const arr of childrenOf.values()) arr.sort(cmp)

  const out: TreeNode<T>[] = []
  const visited = new Set<string>()
  const walk = (parentKey: string | null, depth: number) => {
    for (const node of childrenOf.get(parentKey) ?? []) {
      if (visited.has(node.id)) continue // Zyklus-/Doppel-Schutz
      visited.add(node.id)
      out.push({ ...node, depth })
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)
  // Nicht erreichte Knoten (in einem reinen Zyklus gefangen) defensiv als Wurzeln anhaengen.
  for (const c of list) {
    if (!visited.has(c.id)) {
      visited.add(c.id)
      out.push({ ...c, depth: 0 })
    }
  }
  return out
}

/**
 * Ist `candidateId` gleich `nodeId` ODER ein Nachkomme von `nodeId`?
 * Genutzt fuer den Zyklus-Schutz: eine Kategorie darf nicht sich selbst oder
 * einen ihrer Nachkommen als neuen Parent bekommen.
 * Iterativ von candidate nach oben ueber parentId (Besuchsschutz gegen
 * bestehende Zyklen).
 */
export function isDescendant<T extends CatNode>(
  list: T[],
  candidateId: string | null | undefined,
  nodeId: string
): boolean {
  if (!candidateId) return false
  if (candidateId === nodeId) return true
  const byId = new Map(list.map((c) => [c.id, c]))
  let cur = byId.get(candidateId)
  const seen = new Set<string>()
  while (cur) {
    if (seen.has(cur.id)) break // vorhandener Zyklus → abbrechen
    seen.add(cur.id)
    if (cur.parentId === nodeId) return true
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return false
}

/** Tiefe eines Knotens (0 = Wurzel). Robust gegen Zyklen. */
export function categoryDepth<T extends CatNode>(list: T[], id: string): number {
  const byId = new Map(list.map((c) => [c.id, c]))
  let cur = byId.get(id)
  let depth = 0
  const seen = new Set<string>()
  while (cur?.parentId && byId.has(cur.parentId)) {
    if (seen.has(cur.id)) break
    seen.add(cur.id)
    depth++
    cur = byId.get(cur.parentId)
  }
  return depth
}
