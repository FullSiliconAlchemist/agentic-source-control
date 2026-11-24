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
