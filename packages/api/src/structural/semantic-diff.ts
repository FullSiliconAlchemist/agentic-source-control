import ts from 'typescript'
import { parseSymbols } from './symbols'

type Operation = 'CONSTRUCTION' | 'CALL' | 'CONDITION' | 'BRANCH' | 'RETURN' | 'THROW' | 'IMPORT' | 'EXPORT'
// Effects describe differences between source snapshots. Added and removed operations
// are relative to their enclosing symbol and control-flow context.
type Effect =
  | 'SYMBOL_ADDED'             // The head revision contains a symbol ID absent from the base.
  | 'SYMBOL_REMOVED'           // The base revision contains a symbol ID absent from the head.
  | 'SIGNATURE_CHANGED'        // A callable declaration changed, e.g. its parameters, return type, or modifiers.
  | 'TYPE_CHANGED'             // A type alias definition changed, or a variable's type annotation was added, edited, or removed.
  | 'CONSTRUCTION_ADDED'       // A new expression such as `new DnsCache()` appeared.
  | 'CONSTRUCTION_REMOVED'     // A previously present new expression disappeared.
  | 'CALL_ADDED'               // A call expression such as `cache.lookup(host)` appeared.
  | 'CALL_REMOVED'             // A previously present call disappeared. Its callee may still exist.
  | 'CALL_ARGUMENT_CHANGED'    // A matched call has the same callee expression but different arguments.
  | 'CONDITION_ADDED'          // An if statement or ternary expression introduced a predicate.
  | 'CONDITION_REMOVED'        // A previously present if or ternary predicate disappeared.
  | 'CONDITION_CHANGED'        // A matched predicate changed, e.g. `active` became `active && verified`.
  | 'BRANCH_ADDED'             // An if or ternary gained an execution arm, e.g. an else block.
  | 'BRANCH_REMOVED'           // A previously present then, else, or ternary arm disappeared.
  | 'RETURN_ADDED'             // An explicit return statement appeared, with or without a value.
  | 'RETURN_REMOVED'           // A previously present return statement disappeared.
  | 'RETURN_CHANGED'           // A matched return statement now returns a different expression or switches to/from a bare return.
  | 'THROW_ADDED'              // A throw statement appeared, or this is the new expression in an edited throw.
  | 'THROW_REMOVED'            // A throw statement disappeared, or this is the old expression in an edited throw.
  | 'IMPORT_ADDED'             // A static import declaration appeared. Editing an import can add its new form.
  | 'IMPORT_REMOVED'           // A static import declaration disappeared. Editing an import can remove its old form.
  | 'EXPORT_ADDED'             // A symbol became exported, or an export declaration or assignment appeared.
  | 'EXPORT_REMOVED'           // A symbol ceased to be exported, or an export declaration or assignment disappeared.
  | 'UNKNOWN_SEMANTIC_CHANGE'  // Parsing, ambiguous matches, or an unrecognized edit prevented a more specific finding.

export interface SemanticChange {
  symbol: string
  effect: Effect
  before?: string
  after?: string
  callee?: string
  arguments?: string[]
}

interface Fact {
  kind: Operation
  context: string
  key: string
  text: string
  callee?: string
  args?: string[]
  anchor?: string
}

const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed })

// Structural children omit comments and punctuation while retaining operators and literal values.
function fingerprint(node: ts.Node, excluded?: Set<ts.Node>): string {
  if (excluded?.has(node)) return ''
  const children: string[] = []
  ts.forEachChild(node, child => {
    const key = fingerprint(child, excluded)
    if (key) children.push(key)
  })
  if (children.length) return node.kind + '(' + children.map(key => key.length + ':' + key).join('') + ')'
  if (ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isPrivateIdentifier(node)) {
    return JSON.stringify([node.kind, node.text])
  }
  return String(node.kind)
}

function summarize(root: ts.Node, excluded: Set<ts.Node>) {
  const source = root.getSourceFile()
  const print = (node: ts.Node) => printer.printNode(ts.EmitHint.Unspecified, node, source)
  const facts: Fact[] = []
  let signature: string | undefined
  let signatureKey: string | undefined
  const fn = ts.isVariableDeclaration(root) ? root.initializer : root
  if (fn && (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn) || ts.isMethodSignature(fn) || ts.isAccessor(fn) ||
      ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) {
    const parts = [
      ...(ts.getModifiers(fn) ?? []).filter(m => ![ts.SyntaxKind.ExportKeyword, ts.SyntaxKind.DefaultKeyword].includes(m.kind)).map(print),
      'asteriskToken' in fn && fn.asteriskToken ? '*' : '', fn.questionToken ? '?' : '',
      fn.typeParameters && '<' + fn.typeParameters.map(print).join(', ') + '>',
      '(' + fn.parameters.map(print).join(', ') + ')', fn.type && ': ' + print(fn.type),
    ]
    signature = parts.filter(Boolean).join('')
    const ignored = new Set<ts.Node>((ts.getModifiers(fn) ?? []).filter(m =>
      m.kind === ts.SyntaxKind.ExportKeyword || m.kind === ts.SyntaxKind.DefaultKeyword))
    if ('body' in fn && fn.body) ignored.add(fn.body)
    signatureKey = fingerprint(fn, ignored)
  }

  function visit(node: ts.Node, context: string) {
    if (excluded.has(node) || (ts.isFunctionLike(node) && node !== root && node !== fn)) return
    const record = (kind: Operation, value: ts.Node | undefined, extra = '') =>
      facts.push({ kind, context: context + extra, key: value ? fingerprint(value) : '', text: value ? print(value) : '' })
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      facts.push({ kind: ts.isNewExpression(node) ? 'CONSTRUCTION' : 'CALL', context, key: fingerprint(node), text: print(node),
        callee: print(node.expression), args: (node.arguments ?? []).map(print) })
    } else if (ts.isReturnStatement(node)) record('RETURN', node.expression)
    else if (ts.isThrowStatement(node)) record('THROW', node.expression)
    else if (ts.isImportDeclaration(node) || ts.isImportEqualsDeclaration(node)) record('IMPORT', node)
    else if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) record('EXPORT', node)
    else if (ts.isIfStatement(node) || ts.isConditionalExpression(node)) {
      const predicate = ts.isIfStatement(node) ? node.expression : node.condition
      const thenNode = ts.isIfStatement(node) ? node.thenStatement : node.whenTrue
      const elseNode = ts.isIfStatement(node) ? node.elseStatement : node.whenFalse
      // Compare predicates within the same control construct. Child operations keep their arm.
      const anchor = fingerprint(thenNode) + ':' + (elseNode ? fingerprint(elseNode) : '')
      facts.push({ kind: 'CONDITION', context: context + '/' + node.kind,
        key: fingerprint(predicate), text: print(predicate), anchor })
      const arm = (body: ts.Node, label: string) => {
        const branchContext = context + '/' + node.kind + '/' + label
        facts.push({ kind: 'BRANCH', context: branchContext, key: fingerprint(predicate), text: print(predicate) })
        visit(body, branchContext)
      }
      visit(predicate, context + '/predicate')
      arm(thenNode, 'then')
      if (elseNode) arm(elseNode, 'else')
      return
    }
    ts.forEachChild(node, child => visit(child, context))
  }
  visit(root, '')
  const type = ts.isTypeAliasDeclaration(root) || ts.isVariableDeclaration(root) ? root.type : undefined
  return { facts, signature, signatureKey, type: type && print(type), typeKey: type && fingerprint(type), shape: fingerprint(root, excluded) }
}

function compareFacts(symbol: string, oldFacts: Fact[], newFacts: Fact[]): SemanticChange[] {
  const changes: SemanticChange[] = []
  const groups = new Map<string, { old: Fact[]; next: Fact[] }>()
  for (const [side, facts] of [['old', oldFacts], ['next', newFacts]] as const) {
    for (const fact of facts) {
      const key = JSON.stringify([fact.kind, fact.context, fact.callee])
      const group = groups.get(key) ?? { old: [], next: [] }
      group[side].push(fact)
      groups.set(key, group)
    }
  }
  for (const { old, next } of groups.values()) {
    const removed = old.filter(fact => {
      const match = next.findIndex(candidate => candidate.key === fact.key)
      if (match < 0) return true
      next.splice(match, 1)
      return false
    })
    if (removed.length && next.length) {
      const [a] = removed
      const [b] = next
      if (a.kind === 'BRANCH' && old.length === 1 && next.length === 1) continue // same arm, edited predicate
      const effect = { CALL: 'CALL_ARGUMENT_CHANGED', CONDITION: 'CONDITION_CHANGED', RETURN: 'RETURN_CHANGED' } as const
      if (old.length === 1 && next.length === 1 && a.kind in effect && a.anchor === b.anchor &&
          (a.kind !== 'CALL' || JSON.stringify(a.args) !== JSON.stringify(b.args))) {
        changes.push({ symbol, effect: effect[a.kind as keyof typeof effect], before: a.text, after: b.text,
          ...(a.callee ? { callee: a.callee } : {}) })
        continue
      }
      if (!['IMPORT', 'EXPORT', 'THROW'].includes(a.kind)) {
        changes.push({ symbol, effect: 'UNKNOWN_SEMANTIC_CHANGE', before: removed.map(f => f.text).join('\n'), after: next.map(f => f.text).join('\n') })
        continue
      }
    }
    for (const [direction, facts] of [['REMOVED', removed], ['ADDED', next]] as const) {
      for (const f of facts) changes.push({ symbol, effect: `${f.kind}_${direction}`,
        [direction === 'REMOVED' ? 'before' : 'after']: f.text,
        ...(f.callee ? { callee: f.callee, arguments: f.args } : {}) })
    }
  }
  return changes
}

function snapshot(file: string, text: string | null) {
  // An empty file still has a module symbol. A missing file has no nodes at all.
  const result = text === null ? { symbols: [], nodes: new Map<string, ts.Node>(), gaps: [] } : parseSymbols(file, text)
  const byId = new Map(result.symbols.map(s => [s.id, s]))
  const children = new Map<string, Set<ts.Node>>()
  for (const s of byId.values()) {
    if (!s.parentSymbolId) continue
    const group = children.get(s.parentSymbolId) ?? new Set()
    group.add(result.nodes.get(s.id)!)
    children.set(s.parentSymbolId, group)
  }
  return { ...result, byId, summary: (id: string) => summarize(result.nodes.get(id)!, children.get(id) ?? new Set()) }
}

export function diffSource(file: string, before: string | null, after: string | null): SemanticChange[] {
  const old = snapshot(file, before)
  const next = snapshot(file, after)
  if ((old.gaps.length && !old.nodes.size) || (next.gaps.length && !next.nodes.size)) {
    return [{ symbol: encodeURIComponent(file).replace(/%2F/g, '/') + '::module', effect: 'UNKNOWN_SEMANTIC_CHANGE',
      before: old.gaps.map(g => g.reason).join(', '), after: next.gaps.map(g => g.reason).join(', ') }]
  }
  const changes: SemanticChange[] = []
  for (const id of [...new Set([...old.byId.keys(), ...next.byId.keys()])].sort()) {
    const a = old.byId.get(id)
    const b = next.byId.get(id)
    // An ambiguous declaration is indexed as a node but has no unique symbol.
    if ((!a && old.nodes.has(id)) || (!b && next.nodes.has(id))) {
      changes.push({ symbol: id, effect: 'UNKNOWN_SEMANTIC_CHANGE' })
      continue
    }
    if (!a || !b) changes.push({ symbol: id, effect: a ? 'SYMBOL_REMOVED' : 'SYMBOL_ADDED' })
    if (Boolean(a?.exported) !== Boolean(b?.exported)) changes.push({ symbol: id, effect: b?.exported ? 'EXPORT_ADDED' : 'EXPORT_REMOVED' })
    if (!a || !b) continue
    const x = old.summary(id)
    const y = next.summary(id)
    const events = compareFacts(id, x.facts, y.facts)
    if (x.typeKey !== y.typeKey) events.push({ symbol: id, effect: 'TYPE_CHANGED', before: x.type, after: y.type })
    if (x.signatureKey !== y.signatureKey) events.push({ symbol: id, effect: 'SIGNATURE_CHANGED', before: x.signature, after: y.signature })
    if (!events.length && x.shape !== y.shape) events.push({ symbol: id, effect: 'UNKNOWN_SEMANTIC_CHANGE' })
    changes.push(...events)
  }
  return changes
}
