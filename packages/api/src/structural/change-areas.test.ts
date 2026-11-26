import { expect, it } from 'vitest'
import { buildChangeAreas } from './change-areas'
import type { SemanticChange } from './semantic-diff'

function graph(edges: string[]) {
  return {
    symbols: [...new Set(edges.join(''))].map(id => ({ id, file: id + '.ts' })),
    graphEdges: edges.map(([from, to]) => ({ from, to, type: 'calls' as const })),
  }
}
const edits = (ids: string): SemanticChange[] => [...ids].map(symbol => ({ symbol, effect: 'RETURN_CHANGED' }))

it('groups connected edits and scores shared dependents once, excluding component members', () => {
  const before = graph(['AB', 'XB', 'CX'])
  const after = graph(['XA', 'DX'])
  const changes = edits('BA')
  const areas = buildChangeAreas(changes, before, after)
  expect(areas).toHaveLength(1)
  expect(areas[0]).toMatchObject({
    changedSymbols: ['A', 'B'], semanticEffects: edits('AB'),
    blastRadius: { directDependents: ['X'], transitiveDependents: ['C', 'D'], affectedFiles: ['C.ts', 'D.ts', 'X.ts'], depth: 2 },
    structuralScore: 19,
  })
  expect(areas[0].scoreReasons.map(reason => reason.points)).toEqual([12, 2, 2, 3])
  expect(buildChangeAreas(changes.reverse(), graph(['CX', 'XB', 'AB']), after)).toEqual(areas)
})

it('keeps B and Y separate in disconnected graphs and when they share an unchanged caller', () => {
  for (const edges of [['AB', 'XY'], ['AB', 'XY', 'XB']]) {
    const revision = graph(edges)
    const areas = buildChangeAreas(edits('YB'), revision, revision)
    expect(areas.map(area => area.changedSymbols)).toEqual([['B'], ['Y']])
    expect(new Set(areas.map(area => area.id)).size).toBe(2)
  }
})

it('groups a chain of changed symbols using edges introduced in the head', () => {
  expect(buildChangeAreas(edits('ABC'), graph([]), graph(['BA', 'BC']))[0].changedSymbols).toEqual(['A', 'B', 'C'])
})
