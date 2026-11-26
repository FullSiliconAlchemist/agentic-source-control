import type { buildDependencyGraph } from './dependency-graph'
import type { SemanticChange } from './semantic-diff'

/** Defer new declarations whose only known consumers are other deferred declarations. */
export function findUnreferencedAdditions(changes: readonly SemanticChange[], head: ReturnType<typeof buildDependencyGraph>) {
  const added = new Set(changes.filter(change => change.effect === 'SYMBOL_ADDED').map(change => change.symbol))
  const candidates = new Set(head.symbols.filter(symbol => added.has(symbol.id) && !symbol.exported &&
    (symbol.kind === 'function' || symbol.kind === 'type' || symbol.kind === 'interface')).map(symbol => symbol.id))

  const dependencies = new Map<string, string[]>()
  const used = new Set<string>()
  for (const { from, to } of head.graphEdges) {
    if (!candidates.has(to)) continue
    if (!candidates.has(from)) used.add(to)
    else {
      const targets = dependencies.get(from) ?? []
      targets.push(to)
      dependencies.set(from, targets)
    }
  }
  // Set iteration also visits newly discovered dependencies, including through cycles.
  for (const id of used) {
    for (const dependency of dependencies.get(id) ?? []) used.add(dependency)
  }
  return new Set([...candidates].filter(id => !used.has(id)).sort())
}
