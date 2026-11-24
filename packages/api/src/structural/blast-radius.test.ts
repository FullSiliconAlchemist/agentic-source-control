import { expect, it } from 'vitest'
import { buildDependencyGraph } from './dependency-graph'
import { diffSource } from './semantic-diff'
import { calculateBlastRadii } from './blast-radius'

function graph(names: string, pairs: string[]) {
  return {
    symbols: [...names].map(id => ({ id, file: id + '.ts' })),
    graphEdges: pairs.map(([from, to]) => ({ from, to, type: 'calls' as const })),
  }
}
const edit = [{ symbol: 'D', effect: 'RETURN_CHANGED' as const }]
const empty = graph('', [])

it('finds dependents by shortest distance and deduplicates cycles, self calls and repeated edges', () => {
  const after = graph('ABCD', ['AB', 'BC', 'CD', 'DA', 'CD', 'DD'])
  expect(calculateBlastRadii(edit, after, after)).toEqual([{
    symbol: 'D', directDependents: ['C'], transitiveDependents: ['A', 'B'],
    affectedFiles: ['A.ts', 'B.ts', 'C.ts'], depth: 3,
  }])
  expect(calculateBlastRadii(edit, after, after, 2)[0].transitiveDependents).toEqual(['B'])
  expect(calculateBlastRadii(edit, after, after, 0)[0]).toMatchObject({ depth: 0, affectedFiles: [] })
})

it('defaults to five hops and rejects invalid depth', () => {
  const chain = graph('ABCDEFG', ['AD', 'BA', 'CB', 'EC', 'FE', 'GF'])
  expect(calculateBlastRadii(edit, chain, chain)[0]).toMatchObject({ depth: 5, transitiveDependents: ['B', 'C', 'E', 'F'] })
  expect(() => calculateBlastRadii(edit, chain, chain, -1)).toThrow(RangeError)
})

it('combines edits across revisions without stitching paths between them', () => {
  const before = graph('ABCDX', ['CD', 'BC'])
  const after = graph('ABCDX', ['BD', 'AB', 'XC'])
  const [radius] = calculateBlastRadii([...edit, ...edit], before, after)
  expect(radius).toEqual({ symbol: 'D', directDependents: ['B', 'C'], transitiveDependents: ['A'],
    affectedFiles: ['A.ts', 'B.ts', 'C.ts'], depth: 2 })
})

it('uses the owning revision for removed and added symbols from the semantic diff', () => {
  const file = 'functions.ts'
  const source = 'function leaf() {}\nfunction caller() { leaf() }'
  const full = buildDependencyGraph(new Map([[file, source]]))
  const removed = calculateBlastRadii(diffSource(file, source, null), full, empty)
  const added = calculateBlastRadii(diffSource(file, null, source), empty, full)
  expect(removed).toEqual(added)
  expect(added.find(result => result.symbol === file + '::function:leaf')).toMatchObject({
    directDependents: [file + '::function:caller'], affectedFiles: [file], depth: 1,
  })
})
