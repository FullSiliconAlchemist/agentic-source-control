import { describe, expect, it } from 'vitest'
import { renderAttentionReport, type AttentionFinding } from './attention-report'

describe('renderAttentionReport', () => {
  it('keeps high-attention findings visible when their scope or patch coverage is uncertain', () => {
    const finding: AttentionFinding = {
      file: 'src/worker.ts',
      summary: 'Changes the retry policy.',
      reason: 'The operation may execute more than once.',
      reviewerQuestion: 'Can the destination accept duplicate writes?',
    }
    const rendered = renderAttentionReport({
      pr: { repository: 'example/project', number: 1, title: 'Update config', url: 'https://github.com/example/project/pull/1' },
      intent: 'Update config defaults.',
      startHere: [{ ...finding, lines: '12-15', potentiallyUnrelated: true }],
      remainingHighAttention: [{ ...finding, file: 'src/queue.ts' }],
      routineChanges: [],
      coverage: { patchesAvailable: 2, changedFiles: 3, notes: ['Patch unavailable for src/config.ts.'] },
    })

    expect(rendered).toContain('START HERE\n- src/worker.ts:12-15 [potentially unrelated]')
    expect(rendered).toContain('OTHER HIGH ATTENTION\n- src/queue.ts')
    expect(rendered).toContain('Reviewer question: Can the destination accept duplicate writes?')
    expect(rendered).toContain('2/3 patch files available.\n- Patch unavailable for src/config.ts.')
  })
})
