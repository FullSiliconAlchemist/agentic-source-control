import { buildCodeEvidence } from '../analysis/code-evidence'
import { fetchFileContext } from './file-content'
import { fetchPullRequest } from './pull-request'

async function main() {
  const [repository, number, ...flags] = process.argv.slice(2)
  if (!repository || !number || !/^\d+$/.test(number) || flags.some((flag) => flag !== '--allow-private' && flag !== '--evidence')) {
    throw new Error('Usage: pnpm fetch-pr owner/repo 123 [--allow-private] [--evidence]')
  }

  const token = process.env.GITHUB_TOKEN
  const pr = await fetchPullRequest(repository, Number(number), {
    token,
    allowPrivate: flags.includes('--allow-private'),
  })
  const output = flags.includes('--evidence')
    ? await buildCodeEvidence(pr, (path, side, maxBytes) => fetchFileContext(pr, path, side, maxBytes, token))
    : pr
  console.log(JSON.stringify(output, null, 2))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not fetch the pull request.')
  process.exitCode = 1
})
