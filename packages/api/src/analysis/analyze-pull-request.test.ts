import { describe, expect, it, vi } from 'vitest'
import { renderAttentionReport } from '../reports/attention-report'
import snapshot from '../reports/fixtures/prettier-20305.json'
import { analyzePullRequest } from './analyze-pull-request'
import { buildCodeEvidence } from './code-evidence'
import { parseModelAnalysis } from './model-findings'

const fixtureFinding = {
  file: 'src/language-css/parse/parse-selector.js',
  level: 'high',
  location: { source: 'head', start: 10, end: 13 },
  summary: 'Changes when a selector bypasses parsing.',
  reason: 'Comment handling can change which styles apply.',
  reviewerQuestion: 'Should every real line comment bypass parsing?',
  potentiallyUnrelated: false,
}

const noContext = async () => ({ status: 'unavailable', text: null } as const)
const json = (...findings: unknown[]) => JSON.stringify({ intent: 'Preserve selector lists.', findings })

describe('analyzePullRequest', () => {
  it('puts high findings first, preserves their rank and shows remaining findings and gaps', async () => {
    const evidence = await buildCodeEvidence(snapshot, noContext)
    const generateJson = vi.fn().mockResolvedValue(json(
      { ...fixtureFinding, level: 'low', file: snapshot.files[0].path, location: null, summary: 'Update the changelog.' },
      fixtureFinding,
      { ...fixtureFinding, location: null, summary: 'Second finding.', potentiallyUnrelated: true },
      { ...fixtureFinding, location: null, summary: 'Third finding.' },
      { ...fixtureFinding, location: null, summary: 'Fourth finding.' },
      { ...fixtureFinding, level: 'low', location: null, summary: 'Check scope.', potentiallyUnrelated: true },
    ))
    const report = await analyzePullRequest(evidence, { generateJson })

    expect(generateJson).toHaveBeenCalledTimes(1)
    expect(report.startHere.map(({ summary }) => summary)).toEqual([
      fixtureFinding.summary, 'Second finding.', 'Third finding.',
    ])
    expect(report.remainingHighAttention.map(({ summary }) => summary)).toEqual(['Fourth finding.'])
    const rendered = renderAttentionReport(report)
    expect(rendered).toContain(`${fixtureFinding.file}:10-13`)
    expect(rendered).toContain('[potentially unrelated] — Second finding.')
    expect(rendered).toContain('OTHER POTENTIALLY UNRELATED CHANGES')
    expect(rendered).toContain('ROUTINE CHANGES')
    expect(rendered).toContain('head context unavailable')
  })

  it('rejects malformed JSON and invalid schema fields', async () => {
    const evidence = await buildCodeEvidence(snapshot, noContext)
    expect(() => parseModelAnalysis('}', evidence)).toThrow('invalid JSON')
    expect(() => parseModelAnalysis(json({ ...fixtureFinding, reviewerQuestion: ' ' }), evidence))
      .toThrow('schema')
  })

  it('rejects invented files and lines, including old lines claimed as head lines', async () => {
    const evidence = await buildCodeEvidence(snapshot, noContext)
    expect(() => parseModelAnalysis(json({ ...fixtureFinding, file: 'invented.js' }), evidence))
      .toThrow('outside the supplied code evidence')
    expect(() => parseModelAnalysis(json({
      ...fixtureFinding, location: { source: 'head', start: 13, end: 14 },
    }), evidence)).toThrow('outside the supplied code evidence')
    expect(() => parseModelAnalysis(json({
      ...fixtureFinding, location: { source: 'base', start: 1, end: 1 },
    }), evidence)).toThrow('outside the supplied code evidence')
    expect(() => parseModelAnalysis(json({
      ...fixtureFinding, location: { source: 'old-diff', start: 1, end: 1 },
    }), evidence)).not.toThrow()
  })

  it('accepts a line from pinned head context outside the patch', async () => {
    const evidence = await buildCodeEvidence(snapshot, async () => ({
      status: 'included',
      text: 'line\n'.repeat(20),
    }))
    const file = 'src/language-css/print/misc.js'
    expect(() => parseModelAnalysis(json({
      ...fixtureFinding, file, location: { source: 'head', start: 10, end: 10 },
    }), evidence)).not.toThrow()
  })

  it('accepts a routine entry for a known file even if its unused line range is inaccurate', async () => {
    const evidence = await buildCodeEvidence(snapshot, noContext)
    const file = 'tests/format/scss/comments/__snapshots__/format.test.js.snap'
    const report = await analyzePullRequest(evidence, {
      generateJson: async () => json({
        ...fixtureFinding, file, level: 'low', reviewerQuestion: '',
        location: { source: 'head', start: 1, end: 999 },
      }),
    })
    expect(report.routineChanges).toEqual([`${file} — ${fixtureFinding.summary}`])
  })
})
