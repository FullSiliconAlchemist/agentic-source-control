import { loadGitHubEnv, pullRequestTarget } from './host'
import { buildCodeEvidence } from '../analysis/code-evidence'
import { fetchFileContext } from './file-content'
import { fetchPullRequest } from './pull-request'

async function main() {
  loadGitHubEnv()
  const args = process.argv.slice(2)
  const flags = args.filter(arg => arg.startsWith('--'))
  const target = pullRequestTarget(args.filter(arg => !arg.startsWith('--')))
  if (!target || flags.some(flag => flag !== '--allow-private' && flag !== '--evidence')) {
    throw new Error('Usage: pnpm fetch-pr <PR URL | owner/repo number> [--allow-private] [--evidence]')
  }
  const { repository, number, host, token } = target
  const pr = await fetchPullRequest(repository, number, {
    host: host.host, token,
    allowPrivate: flags.includes('--allow-private'),
  })
  const output = flags.includes('--evidence')
    ? await buildCodeEvidence(pr, (path, side, maxBytes) => fetchFileContext(pr, path, side, maxBytes, token, host.host))
    : pr
  console.log(JSON.stringify(output, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not fetch the pull request.')
  process.exitCode = 1
})
