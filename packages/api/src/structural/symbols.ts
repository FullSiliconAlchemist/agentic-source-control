import ts from 'typescript'

type SymbolKind = 'module' | 'function' | 'method' | 'class' | 'interface' | 'type' | 'variable'

export interface CodeSymbol {
  id: string
  name: string
  kind: SymbolKind
  file: string
  startLine: number
  endLine: number
  exported: boolean
  parentSymbolId?: string
}

interface Gap {
  line: number
  reason: string
}

export function extractSymbols(file: string, text: string): { symbols: CodeSymbol[]; gaps: Gap[] } {
  const { symbols, gaps } = parseSymbols(file, text)
  return { symbols, gaps }
}

export function parseSymbols(file: string, text: string) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  const options = { allowJs: true, noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve }
  const host = ts.createCompilerHost(options)
  host.getSourceFile = (name) => name === file ? source : undefined
  const program = ts.createProgram([file], options, host)
  return indexSource(file, source, program.getSyntacticDiagnostics(source))
}

export function indexSource(file: string, source: ts.SourceFile, diagnostics: readonly ts.Diagnostic[]) {
  const nodes = new Map<string, ts.Node>()
  const symbols: CodeSymbol[] = []
  const gaps: Gap[] = []
  if (!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file)) {
    return { source, nodes, symbols, gaps: [{ line: 1, reason: 'Unsupported file extension' }] }
  }
  const line = (position: number) => source.getLineAndCharacterOfPosition(position).line + 1
  for (const diagnostic of diagnostics) {
    gaps.push({ line: line(diagnostic.start ?? 0), reason: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n') })
  }
  if (gaps.length) return { source, nodes, symbols, gaps }

  const moduleId = encodeURIComponent(file).replace(/%2F/g, '/') + '::module'
  nodes.set(moduleId, source)
  symbols.push({ id: moduleId, file, name: file, kind: 'module', startLine: 1, endLine: line(source.text.length), exported: false })
  const exports = new Set<string>()
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause &&
        ts.isNamedExports(statement.exportClause)) {
      for (const item of statement.exportClause.elements) exports.add((item.propertyName ?? item.name).text)
    }
    if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) exports.add(statement.expression.text)
  }

  const seen = new Set<string>()
  const ambiguous = new Set<string>()
  function add(node: ts.Node, name: string, kind: SymbolKind, parent: string, exported: boolean, qualifier = '') {
    const prefix = parent === moduleId ? moduleId.slice(0, -'::module'.length) : parent
    const id = prefix + '::' + kind + ':' + qualifier + encodeURIComponent(name)
    if (seen.has(id)) {
      ambiguous.add(id)
      gaps.push({ line: line(node.getStart(source)), reason: 'Ambiguous declaration: ' + id })
    }
    seen.add(id)
    nodes.set(id, node)
    symbols.push({ id, name, kind, file, parentSymbolId: parent, exported,
      startLine: line(node.getStart(source)), endLine: line(Math.max(node.getStart(source), node.end - 1)) })
    return id
  }

  for (const statement of source.statements) {
    const flags = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : []
    const exported = flags.some((flag) => flag.kind === ts.SyntaxKind.ExportKeyword)
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          gaps.push({ line: line(declaration.getStart()), reason: 'Destructured binding' })
          continue
        }
        const name = declaration.name.text
        const init = declaration.initializer
        const kind = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? 'function' : 'variable'
        add(declaration, name, kind, moduleId, exported || exports.has(name))
      }
      continue
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      const name = statement.name?.text ?? 'default'
      const kind = ts.isFunctionDeclaration(statement) ? 'function' : ts.isClassDeclaration(statement) ? 'class' :
        ts.isInterfaceDeclaration(statement) ? 'interface' : 'type'
      const parent = add(statement, name, kind, moduleId, exported || exports.has(name))
      if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
        for (const member of statement.members) {
          if (!ts.isMethodDeclaration(member) && !ts.isMethodSignature(member)) continue
          if (!ts.isIdentifier(member.name) && !ts.isPrivateIdentifier(member.name) && !ts.isStringLiteral(member.name)) {
            gaps.push({ line: line(member.getStart()), reason: 'Computed or unsupported method name' })
            continue
          }
          const isStatic = ts.getModifiers(member)?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword)
          add(member, member.name.text, 'method', parent, false, isStatic ? 'static:' : '')
        }
      }
    } else if (ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) {
      gaps.push({ line: line(statement.getStart()), reason: 'Unsupported declaration kind' })
    }
  }
  return { source, nodes, symbols: symbols.filter((s) => !ambiguous.has(s.id) && !ambiguous.has(s.parentSymbolId ?? '')), gaps }
}
