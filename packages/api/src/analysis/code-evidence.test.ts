import { describe, expect, it, vi } from 'vitest'
import type { ChangedFile, PullRequest } from '../github/pull-request'
import snapshot from '../reports/fixtures/prettier-20305.json'
import { buildCodeEvidence } from './code-evidence'

const noContext = { status: 'unavailable', text: null } as const

function prWithFiles(files: ChangedFile[]): PullRequest {
  return { ...snapshot, files, changedFiles: files.length }
}

describe('buildCodeEvidence', () => {
  it('looks up the small parser and printer changes and annotates routine files', async () => {
    const read = vi.fn().mockResolvedValue({ status: 'included', text: 'source' })
    const evidence = await buildCodeEvidence(snapshot, read)

    expect(read.mock.calls).toEqual([
      ['src/language-css/parse/parse-selector.js', 'head', 4000],
      ['src/language-css/print/misc.js', 'head', 4000],
    ])
    expect(evidence.files.find(({ path }) => path.endsWith('.snap'))?.signals)
      .toMatchObject({ test: true, generated: true, changedLines: 69 })
    expect(evidence.files.flatMap(({ context }) => context).map(({ sha }) => sha))
      .toEqual([snapshot.headSha, snapshot.headSha])
    expect(evidence.coverage).toMatchObject({ filesIncluded: 5, limitedPatches: [], limitedContext: [] })
  })

  it('prioritizes sensitive code and records removed, missing, and budget-limited evidence', async () => {
    const file: ChangedFile = {
      path: 'src/billing.js', status: 'removed', additions: 0, deletions: 1, patch: null,
    }
    const files = Array.from({ length: 7 }, (_, index) => ({
      ...file, path: `src/worker-${index}.js`,
    }))
    const read = vi.fn().mockResolvedValue(noContext)
    const evidence = await buildCodeEvidence(prWithFiles([...files, file]), read)

    expect(read).toHaveBeenCalledTimes(6)
    expect(read).toHaveBeenNthCalledWith(1, file.path, 'base', 4000)
    expect(evidence.files[0]).toMatchObject({
      signals: { sensitive: true },
      patchStatus: 'unavailable',
      context: [{ sha: snapshot.baseSha, status: 'unavailable' }],
    })
    expect(evidence.coverage.limitedContext.filter(({ status }) => status === 'omitted')).toHaveLength(2)
  })

  it('caps patch bytes and flags patches GitHub already truncated', async () => {
    const file: ChangedFile = {
      path: 'a.js', status: 'modified', additions: 2, deletions: 0,
      patch: '@@ -0,0 +1,2 @@\n+one',
    }
    const files = [file, ...Array.from({ length: 6 }, (_, index) => ({
      ...file, path: `long-${index}.js`, patch: '+'.padEnd(20_000, 'x'),
    }))]
    const evidence = await buildCodeEvidence(prWithFiles(files), vi.fn().mockResolvedValue(noContext))

    expect(evidence.files[0].patchStatus).toBe('truncated')
    expect(evidence.files[1].patch).toHaveLength(12_000)
    expect(evidence.files.at(-1)?.patchStatus).toBe('omitted')
    expect(evidence.files.reduce((bytes, entry) => bytes + Buffer.byteLength(entry.patch ?? ''), 0))
      .toBe(48_000)
  })
})
