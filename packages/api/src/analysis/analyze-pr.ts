import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { config } from 'dotenv'
import { fetchComparison } from '../github/pull-request'
import { git, resolveCommit } from '../structural/git-snapshot'
import { renderReview, reviewRevisions } from '../structural/review'

export async function runReview(args: string[]) {
  const flags = args.filter(arg => arg.startsWith('--'))
  const values = args.filter(arg => !arg.startsWith('--'))
  const usage = 'Usage: assure review <GitHub PR URL | owner/repo number | base head> [--deterministic] [--json] [--allow-private]'
  if (flags.some(flag => !['--deterministic', '--json', '--allow-private'].includes(flag))) throw new Error(usage)
  const url = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)\/?$/.exec(values[0] ?? '')
  let repository: string | undefined
  let number = 0
  if (url && values.length === 1) {
    repository = url[1]
    number = Number(url[2])
  } else if (values.length === 2 && /^[\w.-]+\/[\w.-]+$/.test(values[0]) && /^\d+$/.test(values[1])) {
    repository = values[0]
    number = Number(values[1])
  } else if (values.length !== 2 || values.some(value => value.includes('://'))) throw new Error(usage)

  let report
  if (repository) {
    config({ path: resolve(__dirname, '../../../../.local.env'), quiet: true })
    const token = process.env.GITHUB_TOKEN
    const { base, head, mergeBase } = await fetchComparison(repository, number, { token, allowPrivate: flags.includes('--allow-private') })
    const dir = mkdtempSync(join(tmpdir(), 'assure-review-'))
    try {
      git(dir, ['init', '--bare', '--quiet'])
      const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      if (token) Object.assign(env, { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.https://github.com/.extraHeader',
        GIT_CONFIG_VALUE_0: 'Authorization: Basic ' + Buffer.from('x-access-token:' + token).toString('base64') })
      git(dir, ['fetch', '--quiet', '--no-tags', '--depth=1', 'https://github.com/' + repository + '.git',
        ...new Set([mergeBase, head])], env)
      report = reviewRevisions(dir, base, head, mergeBase)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  } else {
    const dir = process.env.INIT_CWD || process.cwd()
    report = reviewRevisions(dir, resolveCommit(dir, values[0]), resolveCommit(dir, values[1]))
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
