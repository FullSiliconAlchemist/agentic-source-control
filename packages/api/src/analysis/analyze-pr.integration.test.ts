import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

it('reviews pinned commits through both CLI entry points without loading a model', () => {
  const dir = mkdtempSync(join(tmpdir(), 'review-test-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim()
  const commit = (message: string) => {
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.org', '-c', 'commit.gpgsign=false', 'commit', '-qm', message)
    return git('rev-parse', 'HEAD')
  }
  const api = resolve(__dirname, '../..')
  try {
    git('init', '-q')
    writeFileSync(join(dir, 'code.js'), 'export function evaluate(x) { return sanitize(x) }\nfunction caller(x) { return evaluate(x) }')
    const mergeBase = commit('original')
    writeFileSync(join(dir, 'code.js'), 'export function evaluate(x) { return x }\nfunction caller(x) { return evaluate(x) }')
    writeFileSync(join(dir, 'notes.md'), 'updated')
    const head = commit('change')
    git('checkout', '--detach', '-q', mergeBase)
    writeFileSync(join(dir, 'upstream.js'), 'export const upstream = 1')
    const base = commit('base branch advanced')
    const run = (entry: string[], args: string[], renderer = '', host = 'github.com') => execFileSync(process.execPath, [
      '-r', join(api, 'src/analysis/fixtures/mock-analysis-services.cjs'), ...entry, ...args,
    ], { cwd: api, encoding: 'utf8', env: { ...process.env, INIT_CWD: dir, GITHUB_TOKEN: '', GH_HOST: host, GH_ENTERPRISE_TOKEN: 'fixture-token', MOCK_RENDERER: renderer,
      REVIEW_FIXTURE: JSON.stringify({ base, head, mergeBase }), GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'url.' + dir + '.insteadOf', GIT_CONFIG_VALUE_0: `https://${host}/fixture/project.git` } })
    const assure = ['bin/assure.cjs', 'review']
    const url = 'https://github.com/fixture/project/pull/42'
    const json = run(assure, [url, '--deterministic', '--json'])
    expect(run(['-r', '@swc-node/register', 'src/analysis/analyze-pr.ts'], ['fixture/project', '42', '--json'])).toBe(json)
    const enterprise = 'github.example.test'
    expect(run(assure, [`https://${enterprise}/fixture/project/pull/42/files`, '--allow-private', '--json'], '', enterprise)).toBe(json)
    const report = JSON.parse(json)
    expect(report.revisions).toEqual({ base, head, comparisonBase: mergeBase })
    expect(report.files.map((file: {path: string}) => file.path)).toEqual(['code.js', 'notes.md'])
    expect(report.coverageGaps.skipped).toEqual(['notes.md'])
    expect(report.changeAreas[0]).toMatchObject({ semanticEffects: expect.arrayContaining([
      expect.objectContaining({ effect: 'CALL_REMOVED', callee: 'sanitize' }),
    ]), blastRadius: { directDependents: ['code.js::function:caller'] } })
    expect(run(assure, [url, '--explain', '--deterministic', '--json'])).toBe(json)
    for (const mode of ['failed', 'invalid']) {
      expect(run(assure, [url, '--explain', '--json'], mode)).toBe(json)
    }
    const { explanations, ...canonical } = JSON.parse(run(assure, [url, '--explain', '--json'], 'success'))
    expect(canonical).toEqual(report)
    expect(explanations).toEqual([{ areaId: report.changeAreas[0].id,
      text: 'The change removes a call to sanitize in code.js::function:evaluate.' }])
    const local = run(assure, [mergeBase, head, '--deterministic'])
    expect(local).toContain('PR STRUCTURAL REVIEW')
    expect(local).toContain('CALL_REMOVED')
    expect(local).toContain('Direct dependents: code.js::function:caller')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 30000)
