import { describe, expect, it } from 'vitest'
import { diffSource } from './semantic-diff'

const diff = (before: string, after: string) => diffSource('src/file.ts', before, after)

describe('semantic diff', () => {
  it('reports a removed call and changed return', () => {
    const changes = diff('function foo(x) { return sanitize(x); }', 'function foo(x) { return x; }')
    expect(changes.map(c => c.effect)).toEqual(['RETURN_CHANGED', 'CALL_REMOVED'])
    expect(changes[1]).toMatchObject({ callee: 'sanitize', arguments: ['x'] })
  })

  it('preserves the direction of the visitor-key deletion at module and function scope', () => {
    const statement = 'visitorKeys = removeNodeTypes(visitorKeys, ["StructBody", "StructDeclaration"]);'
    for (const wrapper of ['', 'function evaluateVisitorKeys(visitorKeys) { BODY return visitorKeys; }']) {
      const changes = diff(wrapper ? wrapper.replace('BODY', statement) : statement, wrapper.replace('BODY', ''))
      expect(changes).toHaveLength(1)
      expect(changes[0]).toMatchObject({
        effect: 'CALL_REMOVED', callee: 'removeNodeTypes', arguments: ['visitorKeys', '["StructBody", "StructDeclaration"]'],
      })
    }
  })

  it('matches predicates by content before considering edits', () => {
    expect(diff('if (user.active) { run() }', 'if (user.active && user.verified) { run() }'))
      .toEqual([{ symbol: 'src/file.ts::module', effect: 'CONDITION_CHANGED', before: 'user.active', after: 'user.active && user.verified' }])
    const preserved = 'if (a) { f() } if (b) { g() }'
    const changes = diff(preserved, 'if (x) { h() } ' + preserved)
    expect(changes.map(c => c.effect).sort()).toEqual(['BRANCH_ADDED','CALL_ADDED','CONDITION_ADDED'])
  })

  it('reports optional parameters and call arguments', () => {
    const before = 'export function foo(a: string) { send(a) }'
    const after = 'export function foo(a: string, b?: number) { send(a, b) }'
    expect(diff(before, after).map(c => c.effect)).toEqual(['CALL_ARGUMENT_CHANGED','SIGNATURE_CHANGED'])
  })

  it('ignores formatting and comments', () => {
    expect(diff('function f(){run(a,b)}', '// moved\nfunction f() { run( a, /* arg */ b, ); }')).toEqual([])
  })

  it('reports imports, exports, throws and branches', () => {
    const changes = diff('function f() {}', 'import "./setup"; export function f() { if (x) throw err }')
    expect(changes.map(c => c.effect).sort()).toEqual(['BRANCH_ADDED','CONDITION_ADDED','EXPORT_ADDED','IMPORT_ADDED','THROW_ADDED'])
  })

  it('reports ambiguous edits and parse gaps', () => {
    expect(diff('foo(a); foo(b)', 'foo(c); foo(d)')[0].effect).toBe('UNKNOWN_SEMANTIC_CHANGE')
    expect(diff('function {', 'function ok() {}')[0].effect).toBe('UNKNOWN_SEMANTIC_CHANGE')
  })
})

it('retains the DNS cache migration alongside unchanged unsupported declarations (got #2463)', () => {
  const before = `
import OldCache from 'external-cache'
const { config } = source
type Normalized = { cache: OldCache }
const shared = (): OldCache => new OldCache()
class Options {
  [computed]() {}
  get cache(): OldCache | boolean { return this.value }
  set cache(value: OldCache | boolean) { this.value = value }
}`
  const after = before.replace("OldCache from 'external-cache'", "DnsCache from './cache.js'")
    .replaceAll('OldCache', 'DnsCache').replace('get cache(): DnsCache | boolean', 'get cache(): DnsCache')
    .replace('this.value = value', 'if (value !== undefined) { assertAny("cache.lookup", value.lookup); assertAny("cache.clear", value.clear) } this.value = value')
  const changes = diff(before, after)
  expect(changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ effect: 'IMPORT_REMOVED', before: expect.stringContaining('external-cache') }),
    expect.objectContaining({ effect: 'IMPORT_ADDED', after: expect.stringContaining('./cache.js') }),
    expect.objectContaining({ effect: 'TYPE_CHANGED', symbol: 'src/file.ts::type:Normalized' }),
    expect.objectContaining({ effect: 'CONSTRUCTION_REMOVED', callee: 'OldCache' }),
    expect.objectContaining({ effect: 'CONSTRUCTION_ADDED', callee: 'DnsCache' }),
    expect.objectContaining({ effect: 'SIGNATURE_CHANGED', symbol: 'src/file.ts::class:Options::getter:cache' }),
    expect.objectContaining({ effect: 'CONDITION_ADDED', symbol: 'src/file.ts::class:Options::setter:cache' }),
  ]))
  expect(changes.filter(c => c.effect === 'CALL_ADDED').map(c => c.arguments?.[0])).toEqual(['"cache.lookup"', '"cache.clear"'])
  expect(changes.some(c => c.effect === 'UNKNOWN_SEMANTIC_CHANGE')).toBe(false)
  expect(diff(before, before)).toEqual([])
})

it('keeps invalid syntax opaque and avoids a false addition when overloads become unambiguous', () => {
  expect(diff('function {', 'function ok() {}').map(c => c.effect)).toEqual(['UNKNOWN_SEMANTIC_CHANGE'])
  expect(diff('function f(): void; function f() {}', 'function f() {}')
    .filter(c => c.symbol.endsWith('::function:f')).map(c => c.effect)).toEqual(['UNKNOWN_SEMANTIC_CHANGE'])
})

it('distinguishes a missing module from an empty file when a revision adds or removes it', () => {
  const file = 'source/core/utils/dns-cache.ts'
  const source = 'export default class DnsCache {}'
  for (const text of ['', source]) {
    expect(diffSource(file, null, text).filter(event => event.symbol === file + '::module')).toEqual([
      { symbol: file + '::module', effect: 'SYMBOL_ADDED' },
    ])
    expect(diffSource(file, text, null).filter(event => event.symbol === file + '::module')).toEqual([
      { symbol: file + '::module', effect: 'SYMBOL_REMOVED' },
    ])
  }
  expect(diffSource(file, '', source).filter(event => event.symbol === file + '::module')).toEqual([])
})
