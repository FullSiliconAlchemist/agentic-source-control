import { fetchFileContext } from '../github/file-content'
import { fetchPullRequest } from '../github/pull-request'
import { renderAttentionReport } from '../reports/attention-report'
import { analyzePullRequest } from './analyze-pull-request'
import { buildCodeEvidence } from './code-evidence'
import { loadAnalysisConfig } from './local-config'

async function main() {
  const [repository, number, flag, ...extra] = process.argv.slice(2)
  if (!repository || !number || !/^\d+$/.test(number) || (flag && flag !== '--allow-private') || extra.length) {
    throw new Error('Usage: pnpm analyze-pr owner/repo 123 [--allow-private]')
  }

  const { githubToken, model } = loadAnalysisConfig()
  const pr = await fetchPullRequest(repository, Number(number), {
    token: githubToken,
    allowPrivate: flag === '--allow-private',
  })
  const evidence = await buildCodeEvidence(pr, (path, side, maxBytes) =>
    fetchFileContext(pr, path, side, maxBytes, githubToken))
  console.log(renderAttentionReport(await analyzePullRequest(evidence, model)))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not analyze the pull request.')
  process.exitCode = 1
})
