import type { BlastRadius } from './blast-radius'
import type { SemanticChange } from './semantic-diff'

type Effect = SemanticChange['effect']
type RadiusFactor = keyof Pick<BlastRadius, 'directDependents' | 'transitiveDependents' | 'affectedFiles'>

const eventWeights: Record<Effect, number> = {
  SYMBOL_ADDED: 4, SYMBOL_REMOVED: 8, SIGNATURE_CHANGED: 10,
  CALL_ADDED: 4, CALL_REMOVED: 6, CALL_ARGUMENT_CHANGED: 6,
  CONDITION_ADDED: 5, CONDITION_REMOVED: 8, CONDITION_CHANGED: 8,
  BRANCH_ADDED: 5, BRANCH_REMOVED: 8,
  RETURN_ADDED: 4, RETURN_REMOVED: 6, RETURN_CHANGED: 6,
  THROW_ADDED: 5, THROW_REMOVED: 5,
  IMPORT_ADDED: 1, IMPORT_REMOVED: 1, EXPORT_ADDED: 2, EXPORT_REMOVED: 4,
  UNKNOWN_SEMANTIC_CHANGE: 0,
}
const radiusWeights = [
  { factor: 'directDependents', weight: 2, cap: 20 },
  { factor: 'transitiveDependents', weight: 1, cap: 30 },
  { factor: 'affectedFiles', weight: 1, cap: 20 },
] as const

interface ScoreReason {
  factor: Effect | RadiusFactor
  count: number
  weight: number
  cap?: number
  points: number
}

export function rankStructuralChanges(changes: readonly SemanticChange[], radii: readonly BlastRadius[]) {
  const counts = new Map<string, Map<Effect, number>>()
  for (const { symbol, effect } of changes) {
    const events = counts.get(symbol) ?? new Map<Effect, number>()
    events.set(effect, (events.get(effect) ?? 0) + 1)
    counts.set(symbol, events)
  }
  const radiusBySymbol = new Map(radii.map(radius => [radius.symbol, radius]))
  const scores = [...counts.keys()].sort().map(symbol => {
    const events = counts.get(symbol)!
    const radius = radiusBySymbol.get(symbol)
    if (!radius) throw new Error('Missing blast radius for ' + symbol)
    const scoreReasons: ScoreReason[] = []
    for (const effect of [...events.keys()].sort()) {
      const count = events.get(effect)!
      const weight = eventWeights[effect]
      scoreReasons.push({ factor: effect, count, weight, points: count * weight })
    }
    for (const rule of radiusWeights) {
      const count = radius[rule.factor].length
      scoreReasons.push({ ...rule, count, points: Math.min(count * rule.weight, rule.cap) })
    }
    return { symbol, structuralScore: scoreReasons.reduce((sum, reason) => sum + reason.points, 0), scoreReasons }
  })
  // Stable sort preserves symbol ID order for equal scores.
  return scores.sort((a, b) => b.structuralScore - a.structuralScore)
}
