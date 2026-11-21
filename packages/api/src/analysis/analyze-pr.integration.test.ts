import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function changedFile(filename: string, addedLines: string[], start = 1) {
  return {
    filename,
    status: 'modified',
    additions: addedLines.length,
    deletions: 0,
    patch: `@@ -0,0 +${start},${addedLines.length} @@\n${addedLines.map((line) => `+${line}`).join('\n')}`,
  }
}

function finding(file: string, summary: string, overrides = {}) {
  return {
    file,
    summary,
    level: 'low',
    location: null,
    reason: 'The change is visible in the patch.',
    reviewerQuestion: 'Does the change match the PR intent?',
    potentiallyUnrelated: false,
    ...overrides,
  }
}

function runCli(title: string, files: ReturnType<typeof changedFile>[], findings: ReturnType<typeof finding>[]) {
  const repository = 'fixture/project'
  const number = 42
  const result = spawnSync(process.execPath, [
    '-r', './src/analysis/fixtures/mock-analysis-services.cjs',
    '-r', '@swc-node/register', 'src/analysis/analyze-pr.ts', repository, String(number),
  ], {
    cwd: resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { ...process.env, BEDROCK_MODEL_ID: 'test-model' },
    input: JSON.stringify({
      pr: {
        html_url: `https://github.com/${repository}/pull/${number}`,
        number,
        title,
        body: title,
        base: { sha: 'a'.repeat(40), repo: { full_name: repository, private: false } },
        head: { sha: 'b'.repeat(40) },
        changed_files: files.length,
      },
      files,
      findings,
    }),
    timeout: 10_000,
  })
  if (result.error) throw result.error
  return result
}

describe('analyze-pr CLI', () => {
  it('renders a large generated update as routine', () => {
    const path = 'src/generated/client.ts'
    const files = [changedFile(path, Array.from({ length: 500 }, (_, n) => `export type Item${n} = string`))]
    const result = runCli('Regenerate the SDK', files, [finding(path, 'Refresh generated SDK types.')])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`ROUTINE CHANGES\n- ${path}`)
    expect(result.stdout).not.toContain('START HERE')
  })

  it('leads with a small consequential change and a specific reviewer question', () => {
    const path = 'src/worker.ts'
    const question = 'Can the destination safely accept a duplicate write?'
    const files = [changedFile(path, ['await retry(() => destination.write(record))'], 12)]
    const result = runCli('Retry failed delivery', files, [
      finding(path, 'Retries an external write.', {
        level: 'high',
        location: { source: 'head', start: 12, end: 12 },
        reviewerQuestion: question,
      }),
    ])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`START HERE\n- ${path}:12-12`)
    expect(result.stdout).toContain(question)
    expect(result.stdout).toContain(`head context unavailable for ${path}`)
  })

  it('flags a potentially unrelated auth change alongside its high priority', () => {
    const intended = 'src/export.ts'
    const unrelated = 'src/auth/session.ts'
    const files = [
      changedFile(intended, ['exportCsv(rows, { delimiter: "," })']),
      changedFile(unrelated, ['const idleTimeoutMinutes = 30']),
    ]
    const result = runCli('Change the export format', files, [
      finding(unrelated, 'Changes the session idle timeout.', {
        level: 'high', potentiallyUnrelated: true, reviewerQuestion: 'Should session expiry change in this export PR?',
      }),
      finding(intended, 'Sets the expected delimiter.'),
    ])

    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain(`START HERE\n- ${unrelated} [potentially unrelated]`)
    expect(result.stdout).toContain(`ROUTINE CHANGES\n- ${intended}`)
  })

  it('exits nonzero and prints no report for an invalid citation', () => {
    const file = changedFile('src/worker.ts', ['await destination.write(record)'])
    const result = runCli('Change delivery', [file], [
      finding(file.filename, 'Writes a record.', { level: 'high', location: { source: 'head', start: 999, end: 999 } }),
    ])

    expect(result.status).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('outside the supplied code evidence')
  })
})
