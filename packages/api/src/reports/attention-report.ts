export interface AttentionFinding {
  file: string
  lines?: string
  summary: string
  reason: string
  reviewerQuestion: string
  potentiallyUnrelated?: boolean
}

export interface AttentionReport {
  pr: { repository: string; number: number; title: string; url: string }
  intent: string
  startHere: AttentionFinding[]
  remainingHighAttention: AttentionFinding[]
  potentiallyUnrelated?: AttentionFinding[]
  routineChanges: string[]
  coverage: { patchesAvailable: number; changedFiles: number; notes: string[] }
}

export function renderAttentionReport(report: AttentionReport): string {
  const { pr, coverage } = report
  const lines = [
    'PR ATTENTION REPORT',
    `${pr.repository} #${pr.number} · ${pr.title}`,
    pr.url,
    `Intent: ${report.intent}`,
  ]

  const sections = [
    ['START HERE', report.startHere],
    ['OTHER HIGH ATTENTION', report.remainingHighAttention],
    ['OTHER POTENTIALLY UNRELATED CHANGES', report.potentiallyUnrelated ?? []],
  ] as const

  for (const [heading, findings] of sections) {
    if (findings.length === 0) continue

    lines.push('', heading)
    for (const finding of findings) {
      const location = finding.lines ? `${finding.file}:${finding.lines}` : finding.file
      const scope = finding.potentiallyUnrelated ? ' [potentially unrelated]' : ''
      lines.push(
        `- ${location}${scope} — ${finding.summary}`,
        `  Why it matters: ${finding.reason}`,
        `  Reviewer question: ${finding.reviewerQuestion}`,
      )
    }
  }

  if (report.routineChanges.length > 0) {
    lines.push('', 'ROUTINE CHANGES', ...report.routineChanges.map((change) => `- ${change}`))
  }

  lines.push('', 'COVERAGE', `${coverage.patchesAvailable}/${coverage.changedFiles} patch files available.`)
  lines.push(...coverage.notes.map((note) => `- ${note}`))
  return lines.map((line) => line.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')).join('\n')
}
