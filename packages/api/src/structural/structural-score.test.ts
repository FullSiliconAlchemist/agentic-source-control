import { expect, it } from 'vitest'
import { rankStructuralChanges } from './structural-score'
import type { SemanticChange } from './semantic-diff'

function radius(symbol: string, direct: number, transitive: number, files: number) {
  const ids = (prefix: string, count: number) => Array.from({ length: count }, (_, i) => prefix + i)
  return { symbol, directDependents: ids('caller', direct), transitiveDependents: ids('ancestor', transitive),
    affectedFiles: ids('file', files), depth: transitive ? 2 : direct ? 1 : 0 }
}

it('explains the complete score with raw counts, weights and awarded points', () => {
  const symbol = 'printClass'
  const [score] = rankStructuralChanges([{ symbol, effect: 'BRANCH_ADDED' }], [radius(symbol, 3, 24, 12)])
  expect(score).toEqual({ symbol, structuralScore: 47, scoreReasons: [
    { factor: 'BRANCH_ADDED', count: 1, weight: 5, points: 5 },
    { factor: 'directDependents', count: 3, weight: 2, cap: 20, points: 6 },
    { factor: 'transitiveDependents', count: 24, weight: 1, cap: 30, points: 24 },
    { factor: 'affectedFiles', count: 12, weight: 1, cap: 20, points: 12 },
  ] })
})

it('caps each radius contribution and counts repeated semantic events', () => {
  const symbol = 'shared'
  const event = { symbol, effect: 'CALL_REMOVED' } as const
  const [score] = rankStructuralChanges([event, event], [radius(symbol, 11, 31, 21)])
  expect(score.structuralScore).toBe(82)
  expect(score.scoreReasons.map(reason => reason.points)).toEqual([12, 20, 30, 20])
})

it('ranks by descending score, breaks ties by symbol ID and ignores input order', () => {
  const changes: SemanticChange[] = [
    { symbol: 'z', effect: 'CALL_ADDED' }, { symbol: 'top', effect: 'SIGNATURE_CHANGED' },
    { symbol: 'a', effect: 'CALL_ADDED' }, { symbol: 'top', effect: 'UNKNOWN_SEMANTIC_CHANGE' },
  ]
  const radii = ['z', 'top', 'a'].map(id => radius(id, 0, 0, 0))
  const ranked = rankStructuralChanges(changes, radii)
  expect(ranked.map(item => [item.symbol, item.structuralScore])).toEqual([['top', 10], ['a', 4], ['z', 4]])
  expect(rankStructuralChanges(changes.reverse(), radii.reverse())).toEqual(ranked)
})
