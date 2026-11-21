import { resolve } from 'node:path'
import { config } from 'dotenv'
import { fetchFileContext } from '../github/file-content'
import { fetchPullRequest } from '../github/pull-request'
import { createBedrockModel } from '../llm/bedrock'
import { renderAttentionReport } from '../reports/attention-report'
import { analyzePullRequest } from './analyze-pull-request'
import { buildCodeEvidence } from './code-evidence'

async function main() {
  const [repository, number, flag, ...extra] = process.argv.slice(2)
  if (!repository || !number || !/^\d+$/.test(number) || (flag && flag !== '--allow-private') || extra.length) {
    throw new Error('Usage: pnpm analyze-pr owner/repo 123 [--allow-private]')
  }

  const { error } = config({ path: resolve(__dirname, '../../../../.local.env'), quiet: true })
  if (error && (error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw new Error('Could not read .local.env from the repository root.')
  }

  const { GITHUB_TOKEN, AWS_REGION, BEDROCK_MODEL_ID } = process.env
  const model = createBedrockModel(BEDROCK_MODEL_ID, AWS_REGION)
  const pr = await fetchPullRequest(repository, Number(number), {
    token: GITHUB_TOKEN,
    allowPrivate: flag === '--allow-private',
  })
  const evidence = await buildCodeEvidence(pr, (path, side, maxBytes) =>
    fetchFileContext(pr, path, side, maxBytes, GITHUB_TOKEN))
  console.log(renderAttentionReport(await analyzePullRequest(evidence, model)))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not analyze the pull request.')
  process.exitCode = 1
})
