import { expect, it } from 'vitest'
import { buildDependencyGraph } from './dependency-graph'

const files = new Map([
  ['src/base.ts', `export interface Worker { process(): void }
export class Base {}
export class First extends Base implements Worker { process() {} }
export class Second { process() {} }
export function run() {}
export const count = 2`],
  ['src/index.ts', "export { run as start } from './base.js'"],
  ['ui/main.ts', `import { start as begin } from '../src/index.js'
import { First, Second, count } from '../src/base.js'
export function dispatch(a: First, b: Second, unknown: any) {
  begin()
  a.process()
  b.process()
  unknown.process()
  return count
}`],
])

it('resolves imports through aliases and static relationships across the snapshot', () => {
  const graph = buildDependencyGraph(files)
  const from = 'ui/main.ts::function:dispatch'
  expect(graph.graphEdges.filter(edge => edge.type === 'calls')).toEqual([
    { from, type: 'calls', to: 'src/base.ts::class:First::method:process' },
    { from, type: 'calls', to: 'src/base.ts::class:Second::method:process' },
    { from, type: 'calls', to: 'src/base.ts::function:run' },
  ])
  expect(graph.graphEdges).toEqual(expect.arrayContaining([
    { from: 'src/index.ts::module', type: 'references', to: 'src/base.ts::function:run' },
    { from: 'ui/main.ts::module', type: 'imports', to: 'src/base.ts::function:run' },
    { from, type: 'references', to: 'src/base.ts::variable:count' },
    { from: 'src/base.ts::class:First', type: 'extends', to: 'src/base.ts::class:Base' },
    { from: 'src/base.ts::class:First', type: 'implements', to: 'src/base.ts::interface:Worker' },
  ]))
  expect(graph.unresolved.filter(item => item.type === 'calls')).toEqual([
    { from, type: 'calls', expression: 'unknown.process', line: 7 },
  ])
  expect(buildDependencyGraph(new Map([...files].reverse()))).toEqual(graph)
})

it('uses each revision independently, retaining unresolved imports and calls', () => {
  const importer = ['app.jsx', "import go from './go.js'; export const App = () => go()"] as const
  const before = buildDependencyGraph(new Map([importer, ['go.js', 'export default function go() {}']]))
  expect(before.graphEdges.filter(edge => edge.type === 'calls')).toEqual([
    { from: 'app.jsx::function:App', type: 'calls', to: 'go.js::function:go' },
  ])
  const after = buildDependencyGraph(new Map([importer]))
  expect(after.graphEdges).toEqual([])
  expect(after.unresolved.map(edge => edge.type)).toEqual(['imports', 'calls'])
})
