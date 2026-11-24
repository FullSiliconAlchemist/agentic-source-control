import ts from 'typescript'
import { CodeSymbol, indexSource } from './symbols'

type EdgeType = 'imports' | 'references' | 'calls' | 'extends' | 'implements'
export interface SymbolEdge { from: string; to: string; type: EdgeType }
interface Unresolved { from: string; type: EdgeType; expression: string; line: number }

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Keys are repository-relative Git paths. Resolution sees only this revision. */
export function buildDependencyGraph(files: ReadonlyMap<string, string>) {
  const paths = [...files.keys()].filter(path => /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(path)).sort()
  const options: ts.CompilerOptions = {
    allowJs: true, checkJs: true, noLib: true, types: [], jsx: ts.JsxEmit.Preserve,
    target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
  }
  const host: ts.CompilerHost = {
    getSourceFile(path, target) {
      const text = this.readFile(path)
      return text === undefined ? undefined : ts.createSourceFile(path, text, target, true)
    },
    readFile: path => files.get(path.slice(1)),
    fileExists: path => path.startsWith('/') && files.has(path.slice(1)),
    getCurrentDirectory: () => '/', getCanonicalFileName: path => path,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n',
    getDefaultLibFileName: () => 'lib.d.ts', writeFile() {},
  }
  const program = ts.createProgram(paths.map(path => '/' + path), options, host)
  const checker = program.getTypeChecker()
  const ids = new Map<ts.Node, string>()
  const symbols: CodeSymbol[] = []
  const gaps: { file: string; line: number; reason: string }[] = []
  const sources: ts.SourceFile[] = []
  for (const file of paths) {
    const source = program.getSourceFile('/' + file)!
    const index = indexSource(file, source, program.getSyntacticDiagnostics(source))
    for (const symbol of index.symbols) ids.set(index.nodes.get(symbol.id)!, symbol.id)
    symbols.push(...index.symbols)
    gaps.push(...index.gaps.map(gap => ({ ...gap, file })))
    if (ids.has(source)) sources.push(source)
  }

  const edges = new Map<string, SymbolEdge>()
  const unresolved: Unresolved[] = []

  function declarationOf(node: ts.Node) {
    let symbol = checker.getSymbolAtLocation(node)
    if (ts.isShorthandPropertyAssignment(node.parent))
      symbol = checker.getShorthandAssignmentValueSymbol(node.parent)
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    return symbol?.declarations?.length === 1 ? symbol.declarations[0] : undefined
  }

  function record(from: string, type: EdgeType, node: ts.Node, declaration: ts.Declaration | null | undefined = declarationOf(node)) {
    const to = declaration && ids.get(declaration)
    if (to) {
      edges.set(JSON.stringify([from, type, to]), { from, type, to })
    } else {
      const source = node.getSourceFile()
      unresolved.push({ from, type, expression: node.getText(source),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 })
    }
  }

  function visit(node: ts.Node, owner: string) {
    const from = ids.get(node) ?? owner
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause
      if (clause?.name) record(from, 'imports', clause.name)
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamedImports(bindings) && bindings.elements.length) {
        for (const item of bindings.elements) record(from, 'imports', item.name)
      } else if (bindings || !clause?.name) record(from, 'imports', node.moduleSpecifier)
      return
    }
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause
      if (clause && ts.isNamedExports(clause)) {
        for (const item of clause.elements) record(from, 'references', item.name)
      } else if (node.moduleSpecifier) record(from, 'references', node.moduleSpecifier)
      return
    }
    if (ts.isHeritageClause(node)) {
      for (const item of node.types) {
        record(from, node.token === ts.SyntaxKind.ExtendsKeyword ? 'extends' : 'implements', item.expression)
        item.typeArguments?.forEach(arg => visit(arg, from))
      }
      return
    }
    if (ts.isCallExpression(node)) {
      const expr = node.expression
      const decl = declarationOf(expr)
      // A callable variable or parameter may hold any implementation at runtime.
      const callable = decl && (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) ||
        ts.isMethodSignature(decl) || (ts.isVariableDeclaration(decl) && decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))))
      if (callable) record(from, 'calls', expr, decl)
      else record(from, 'calls', expr, null)
      if (ts.isPropertyAccessExpression(expr)) visit(expr.expression, from)
      else if (!ts.isIdentifier(expr)) visit(expr, from)
      node.typeArguments?.forEach(arg => visit(arg, from))
      node.arguments.forEach(arg => visit(arg, from))
      return
    }
    if (ts.isIdentifier(node)) {
      const parent = node.parent
      if ((parent as ts.NamedDeclaration).name === node &&
          !ts.isPropertyAccessExpression(parent) && !ts.isShorthandPropertyAssignment(parent)) return
      const decl = declarationOf(node)
      // Parameters and local bindings aren't vertices in the repository graph.
      if (decl && !ids.has(decl) && (ts.isParameter(decl) || ts.isTypeParameterDeclaration(decl) ||
          ts.isVariableDeclaration(decl))) return
      record(from, 'references', node, decl)
    }
    ts.forEachChild(node, child => visit(child, from))
  }

  for (const source of sources) visit(source, ids.get(source)!)
  return { symbols, graphEdges: [...edges.entries()].sort(([a], [b]) => compare(a, b)).map(([, edge]) => edge),
    unresolved, gaps }
}
