import { describe, expect, it } from 'vitest'
import { extractSymbols } from './symbols'

describe('snapshot symbol extraction', () => {
  it.each(['js', 'jsx', 'ts', 'tsx'])('preserves IDs when %s declarations move', (ext) => {
    const file = 'src/widget.' + ext
    const source = 'export class Widget {\n  render() { return 1 }\n}\nconst make = () => new Widget()\nexport { make }'
    const first = extractSymbols(file, source)
    const moved = extractSymbols(file, '// comment\n\n' + source)
    expect(first.gaps).toEqual([])
    expect(moved.symbols.map(s => s.id)).toEqual(first.symbols.map(s => s.id))
    expect(first.symbols[2]).toMatchObject({
      id: file + '::class:Widget::method:render', parentSymbolId: file + '::class:Widget', startLine: 2, endLine: 2,
    })
    expect(moved.symbols[2].startLine).toBe(4)
    expect(first.symbols[3]).toMatchObject({ name: 'make', exported: true, kind: 'function' })
  })

  it('recognizes typed declarations and JSX', () => {
    const result = extractSymbols('view.tsx', 'interface Props { draw(): void }\ntype Id = string\nexport function View() { return <div/> }')
    expect(result.gaps).toEqual([])
    expect(result.symbols.map(s => s.kind)).toEqual(['module','interface','method','type','function'])
    expect(extractSymbols('view.jsx', 'export const View = () => <div/>').gaps).toEqual([])
  })

  it('records syntax and identity gaps', () => {
    expect(extractSymbols('bad.ts', 'function {').symbols).toEqual([])
    expect(extractSymbols('bad.ts', 'function {').gaps.length).toBeGreaterThan(0)
    const overloaded = extractSymbols('a.ts', 'function f(): void; function f() {}')
    expect(overloaded.symbols.map(s => s.kind)).toEqual(['module'])
    expect(overloaded.gaps[0].reason).toContain('Ambiguous')
  })

  it('represents module-level executable code', () => {
    const result = extractSymbols('keys.js', 'visitorKeys = removeNodeTypes(visitorKeys, ["StructBody"]);')
    expect(result.symbols.map(s => s.id)).toEqual(['keys.js::module'])
  })
})
