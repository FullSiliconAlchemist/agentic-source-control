import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGitHubEnv, pullRequestTarget } from '../github/host'
import { fetchComparison } from '../github/pull-request'
import { git, resolveCommit } from '../structural/git-snapshot'
import { renderReview, reviewRevisions } from '../structural/review'

export async function runReview(args: string[]) {
  const flags = args.filter(arg => arg.startsWith('--'))
  const values = args.filter(arg => !arg.startsWith('--'))
  const usage = 'Usage: assure review <GitHub PR URL | owner/repo number | base head> [--deterministic] [--explain] [--json] [--allow-private]'
  if (flags.some(flag => !['--deterministic', '--explain', '--json', '--allow-private'].includes(flag))) throw new Error(usage)
  loadGitHubEnv()
  const target = pullRequestTarget(values)
  let report
  if (target) {
    const { repository, number, host, token } = target
    const { base, head, mergeBase } = await fetchComparison(repository, number, {
      token, host: host.host, allowPrivate: flags.includes('--allow-private'),
    })
    const dir = mkdtempSync(join(tmpdir(), 'assure-review-'))
    try {
      git(dir, ['init', '--bare', '--quiet'])
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      const authOptions: string[] = []
      if (token) {
        Object.assign(env, { ASSURE_GIT_AUTH: 'Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64') })
        authOptions.push(`--config-env=http.${host.origin}/.extraHeader=ASSURE_GIT_AUTH`)
      }
      git(dir, [...authOptions, 'fetch', '--quiet', '--no-tags', '--depth=1', host.origin + '/' + repository + '.git',
        ...new Set([mergeBase, head])], env)
      report = reviewRevisions(dir, base, head, mergeBase)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  } else {
    if (values.length !== 2 || values.some(value => value.includes('://'))) throw new Error(usage)
    const dir = process.env.INIT_CWD || process.cwd()
    report = reviewRevisions(dir, resolveCommit(dir, values[0]), resolveCommit(dir, values[1]))
  }
  if (flags.includes('--explain') && !flags.includes('--deterministic') && report.changeAreas.length) {
    try {
      const { loadAnalysisConfig } = await import('./local-config')
      const { explainAreas } = await import('../structural/explain-review')
      const explanations = await explainAreas(report.changeAreas, loadAnalysisConfig().model)
      if (flags.includes('--json')) return JSON.stringify({ ...report, explanations })
      return renderReview(report) + '\n\nREVIEWER NOTES\n' +
        explanations.map((note, i) => (i + 1) + '. ' + note.text).join('\n')
    } catch (error) {
      const detail = error instanceof Error ? error.name + ': ' + error.message : 'Unknown error'
      console.error('Bedrock explanations unavailable. ' + detail + '\nShowing the deterministic review.')
    }
  }
  return flags.includes('--json') ? JSON.stringify(report) : renderReview(report)
}

export function main(args: string[]) {
  runReview(args).then(output => console.log(output)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Could not analyze the revisions.')
    process.exitCode = 1
  })
}

if (require.main === module) main(process.argv.slice(2))
