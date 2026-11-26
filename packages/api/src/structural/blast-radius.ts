import type { SymbolEdge } from './dependency-graph'
import type { SemanticChange } from './semantic-diff'
import type { CodeSymbol } from './symbols'

export interface RevisionGraph {
  symbols: ReadonlyArray<Pick<CodeSymbol, 'id' | 'file'>>
  graphEdges: readonly SymbolEdge[]
}

export interface BlastRadius {
  symbol: string
  directDependents: string[]
  transitiveDependents: string[]
  /** Files containing reachable dependents, including same-file dependents. */
  affectedFiles: string[]
  /** Greatest reported shortest-path distance from the changed symbol. */
  depth: number
}

function indexRevision(graph: RevisionGraph) {
  const files = new Map(graph.symbols.map(symbol => [symbol.id, symbol.file]))
  const incoming = new Map<string, Set<string>>()
  for (const { from, to } of graph.graphEdges) {
    const dependents = incoming.get(to) ?? new Set<string>()
    dependents.add(from)
    incoming.set(to, dependents)
  }
  return { files, incoming }
}

function distancesFrom(roots: string[], incoming: Map<string, Set<string>>, maxDepth: number) {
  const distances = new Map(roots.map(id => [id, 0]))
  const queue = [...roots]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]
    const depth = distances.get(current)!
    if (depth === maxDepth) break
    for (const dependent of incoming.get(current) ?? []) {
      if (distances.has(dependent)) continue
      distances.set(dependent, depth + 1)
      queue.push(dependent)
    }
  }
  for (const root of roots) distances.delete(root)
  return distances
}

export function calculateBlastRadii(
  changes: readonly SemanticChange[], before: RevisionGraph, after: RevisionGraph, maxDepth = 5,
): BlastRadius[] {
  const measure = createBlastRadiusCalculator(before, after, maxDepth)
  const changedSymbols = [...new Set(changes.map(change => change.symbol))].sort()
  return changedSymbols.map(symbol => ({ symbol, ...measure([symbol]) }))
}

export function createBlastRadiusCalculator(before: RevisionGraph, after: RevisionGraph, maxDepth = 5) {
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new RangeError('maxDepth must be a nonnegative integer')
  const revisions = [indexRevision(before), indexRevision(after)]
  return (symbols: string[]): Omit<BlastRadius, 'symbol'> => {
    const distances = new Map<string, number>()
    const files = new Set<string>()
    for (const revision of revisions) {
      const roots = symbols.filter(id => revision.files.has(id))
      // Walk one revision at a time so paths cannot cross between snapshots.
      for (const [id, distance] of distancesFrom(roots, revision.incoming, maxDepth)) {
        distances.set(id, Math.min(distances.get(id) ?? Infinity, distance))
        files.add(revision.files.get(id)!)
      }
    }
    const directDependents: string[] = []
    const transitiveDependents: string[] = []
    let depth = 0
    for (const [id, distance] of distances) {
      if (distance === 1) directDependents.push(id)
      else transitiveDependents.push(id)
      depth = Math.max(depth, distance)
    }
    return { directDependents: directDependents.sort(), transitiveDependents: transitiveDependents.sort(),
      affectedFiles: [...files].sort(), depth }
  }
}
