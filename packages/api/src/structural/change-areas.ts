import { createHash } from 'node:crypto'
import { createBlastRadiusCalculator, type RevisionGraph } from './blast-radius'
import type { SemanticChange } from './semantic-diff'
import { scoreImpact } from './structural-score'

function eventKey(change: SemanticChange) {
  return JSON.stringify([change.effect, change.before, change.after, change.callee, change.arguments])
}

export function buildChangeAreas(
  changes: readonly SemanticChange[], before: RevisionGraph, after: RevisionGraph, maxDepth = 5,
) {
  const events = new Map<string, SemanticChange[]>()
  const neighbors = new Map<string, Set<string>>()
  for (const change of changes) {
    if (!events.has(change.symbol)) {
      events.set(change.symbol, [])
      neighbors.set(change.symbol, new Set())
    }
    events.get(change.symbol)!.push(change)
  }
  for (const graph of [before, after]) {
    for (const { from, to } of graph.graphEdges) {
      if (neighbors.has(from) && neighbors.has(to)) {
        neighbors.get(from)!.add(to)
        neighbors.get(to)!.add(from)
      }
    }
  }

  const measure = createBlastRadiusCalculator(before, after, maxDepth)
  const visited = new Set<string>()
  const areas = []
  for (const root of [...events.keys()].sort()) {
    if (visited.has(root)) continue
    const members = [root]
    visited.add(root)
    for (let i = 0; i < members.length; i++) {
      for (const neighbor of neighbors.get(members[i])!) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        members.push(neighbor)
      }
    }
    members.sort()
    const semanticEffects = members.flatMap(id => events.get(id)!.sort((a, b) => {
      const left = eventKey(a)
      const right = eventKey(b)
      return left < right ? -1 : left > right ? 1 : 0
    }))
    const counts = new Map<SemanticChange['effect'], number>()
    for (const { effect } of semanticEffects) counts.set(effect, (counts.get(effect) ?? 0) + 1)
    const blastRadius = measure(members)
    const id = 'area-' + createHash('sha256').update(JSON.stringify(members)).digest('hex')
    areas.push({ id, changedSymbols: members, semanticEffects, blastRadius, ...scoreImpact(counts, blastRadius) })
  }
  // Components were visited in lexicographic order of their smallest symbol.
  return areas.sort((a, b) => b.structuralScore - a.structuralScore)
}
