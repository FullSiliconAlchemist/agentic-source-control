import { calculateBlastRadii } from './blast-radius'
import { buildChangeAreas } from './change-areas'
import { buildDependencyGraph } from './dependency-graph'
import { findUnreferencedAdditions } from './review-focus'
import { readSnapshot } from './git-snapshot'
import { diffSource, type SemanticChange } from './semantic-diff'
import { rankStructuralChanges } from './structural-score'

export function reviewRevisions(dir: string, base: string, head: string, comparisonBase = base) {
  const before = readSnapshot(dir, comparisonBase)
  const after = readSnapshot(dir, head)
  const files = []
  const semanticChanges: SemanticChange[] = []
  const skipped = []
  for (const path of [...new Set([...before.entries.keys(), ...after.entries.keys()])].sort()) {
    const old = before.entries.get(path)
    const next = after.entries.get(path)
    if (old === next) continue
    const status = !old ? 'added' : !next ? 'removed' : 'modified'
    files.push({ path, status })
    if ((old && !before.sources.has(path)) || (next && !after.sources.has(path))) {
      skipped.push(path)
      continue
    }
    semanticChanges.push(...diffSource(path, before.sources.get(path) ?? null, after.sources.get(path) ?? null))
  }
  const a = buildDependencyGraph(before.sources)
  const b = buildDependencyGraph(after.sources)
  const blastRadius = calculateBlastRadii(semanticChanges, a, b)
  const deferred = findUnreferencedAdditions(semanticChanges, b)
  const reviewChanges = semanticChanges.filter(change => !deferred.has(change.symbol))
  return {
    deferredAdditions: [...deferred],
    revisions: { base, comparisonBase, head }, files,
    symbols: { before: a.symbols, after: b.symbols }, semanticChanges,
    graphEdges: { before: a.graphEdges, after: b.graphEdges },
    coverageGaps: { skipped, before: [...before.gaps, ...a.gaps], after: [...after.gaps, ...b.gaps],
      unresolved: { before: a.unresolved, after: b.unresolved } },
    changeAreas: buildChangeAreas(reviewChanges, a, b), blastRadius, scores: rankStructuralChanges(reviewChanges, blastRadius),
  }
}

export function renderReview(report: ReturnType<typeof reviewRevisions>) {
  const { revisions, coverageGaps: gaps } = report
  const lines = ['PR STRUCTURAL REVIEW', revisions.comparisonBase + ' → ' + revisions.head,
    report.files.length + ' changed files, ' + report.semanticChanges.length + ' semantic events, ' +
    report.changeAreas.length + ' change areas']
  for (const [i, area] of report.changeAreas.entries()) {
    lines.push('', `${i + 1}. ${area.changedSymbols.join(', ')} (score ${area.structuralScore})`)
    for (const event of area.semanticEffects) {
      const detail = [event.before, event.after].filter(value => value !== undefined).join(' → ')
      lines.push('  ' + event.effect + ' ' + (detail || event.callee || '') + ' [' + event.symbol + ']')
    }
    lines.push('  Direct dependents: ' + (area.blastRadius.directDependents.join(', ') || 'none'),
      '  Transitive dependents: ' + (area.blastRadius.transitiveDependents.join(', ') || 'none'),
      '  Affected files: ' + (area.blastRadius.affectedFiles.join(', ') || 'none'),
      '  Score: ' + area.scoreReasons.map(reason => reason.factor + ' +' + reason.points).join(', '))
  }
  if (report.deferredAdditions.length) {
    lines.push('', `Deferred additions: ${report.deferredAdditions.length} new declarations without a resolved use outside the group (see --json).`)
  }
  lines.push('', `Coverage: ${gaps.skipped.length} changed files skipped; ${gaps.before.length}/${gaps.after.length} source gaps and ${gaps.unresolved.before.length}/${gaps.unresolved.after.length} unresolved relationships (before/after). See --json for details.`)
  return lines.join('\n')
}
