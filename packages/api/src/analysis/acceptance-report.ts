import { fetchFileContext } from '../github/file-content'
import { renderAttentionReport } from '../reports/attention-report'
import snapshot from '../reports/fixtures/prettier-20305.json'
import { analyzePullRequest } from './analyze-pull-request'
import { buildCodeEvidence } from './code-evidence'
import { loadAnalysisConfig } from './local-config'

const parserPath = 'src/language-css/parse/parse-selector.js'
const matcherPath = 'src/language-css/print/misc.js'

async function main() {
  const { githubToken, model } = loadAnalysisConfig()
  const evidence = await buildCodeEvidence(snapshot, (path, side, maxBytes) =>
    fetchFileContext(snapshot, path, side, maxBytes, githubToken))
  const report = await analyzePullRequest(evidence, model)
  console.log(renderAttentionReport(report))

  const high = [...report.startHere, ...report.remainingHighAttention]
  const first = report.startHere[0]
  const firstDecision = first ? `${first.summary} ${first.reason} ${first.reviewerQuestion}` : ''
  // The actual decision to bypass parsing is on head line 10 in this pinned snapshot.
  const range = /^(\d+)-(\d+)$/.exec(first?.lines ?? '')
  const checks: [boolean, string][] = [
    [first?.file === parserPath, 'Lead with the selector parser change'],
    [Boolean(range && Number(range[1]) <= 10 && Number(range[2]) >= 10), 'Cite the changed parser decision on head line 10'],
    [Boolean(first?.reviewerQuestion.includes('?') &&
      /empty|quote|escape|delimiter/i.test(first.reviewerQuestion)), 'Ask a concrete question about how quoted values affect comment detection'],
    [high.some(({ file }) => file === matcherPath) ||
      /removeQuotedStrings|remov\w* quoted strings|shared (?:string )?match/i.test(firstDecision),
    'Address the shared matcher in a high-attention finding'],
    [high.every(({ file }) => !file.endsWith('.snap')), 'Keep routine snapshot changes out of high attention'],
  ]
  console.log('\nACCEPTANCE CHECKS')
  for (const [passed, label] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} — ${label}`)
  if (checks.some(([passed]) => !passed)) process.exitCode = 1
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not run live acceptance.')
  process.exitCode = 1
})
