import { expect, it } from 'vitest'
import { diffSource } from './semantic-diff'
import { buildDependencyGraph } from './dependency-graph'
import { findUnreferencedAdditions } from './review-focus'

it('defers isolated additions and retains edits, used helpers, exports and module-level execution', () => {
  const file = 'app.ts'
  const before = 'export function run() { return 1 }'
  const after = `
    export function run() { return step() }
    function step() { return finish() }
    function finish() { return 2 }
    function unusedA() { return unusedB() + run() }
    function unusedB() { return unusedA() }
    type Spare = number
    export function api() {}
    function setup() {}
    const initialized = setup()
  `
  const changes = diffSource(file, before, after)
  const graph = buildDependencyGraph(new Map([[file, after]]))
  expect([...findUnreferencedAdditions(changes, graph)]).toEqual([
    'app.ts::function:unusedA', 'app.ts::function:unusedB', 'app.ts::type:Spare',
  ])
})
