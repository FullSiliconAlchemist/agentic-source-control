import type { JsonSchema } from '../llm/json-model'
import type { buildCodeEvidence } from './code-evidence'

export type CodeEvidence = Awaited<ReturnType<typeof buildCodeEvidence>>
type EvidenceFile = CodeEvidence['files'][number]

const levels = ['high', 'low'] as const
const sources = ['head', 'old-diff', 'base'] as const

export const modelAnalysisSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'findings'],
  properties: {
    intent: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'level', 'location', 'summary', 'reason', 'reviewerQuestion', 'potentiallyUnrelated'],
        properties: {
          file: { type: 'string' },
          level: { type: 'string', enum: [...levels] },
          location: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                required: ['source', 'start', 'end'],
                properties: {
                  source: { type: 'string', enum: [...sources] },
                  start: { type: 'integer' },
                  end: { type: 'integer' },
                },
              },
            ],
          },
          summary: { type: 'string' },
          reason: { type: 'string' },
          reviewerQuestion: { type: 'string' },
          potentiallyUnrelated: { type: 'boolean' },
        },
      },
    },
  },
}

interface Location {
  source: typeof sources[number]
  start: number
  end: number
}

interface ModelFinding {
  file: string
  level: typeof levels[number]
  location: Location | null
  summary: string
  reason: string
  reviewerQuestion: string
  potentiallyUnrelated: boolean
}

interface ModelAnalysis {
  intent: string
  findings: ModelFinding[]
}

function hasKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit
}

function line(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function validLocation(value: unknown): value is Location | null {
  return value === null || (
    hasKeys(value, ['source', 'start', 'end']) &&
    sources.some((source) => source === value.source) &&
    line(value.start) && line(value.end) && value.start <= value.end
  )
}

function validFinding(value: unknown): value is ModelFinding {
  return hasKeys(value, ['file', 'level', 'location', 'summary', 'reason', 'reviewerQuestion', 'potentiallyUnrelated']) &&
    text(value.file, 4096) && levels.some((level) => level === value.level) &&
    validLocation(value.location) && text(value.summary, 300) && text(value.reason, 600) &&
    text(value.reviewerQuestion, 300) && typeof value.potentiallyUnrelated === 'boolean'
}

function matchesSource(file: EvidenceFile, location: Location): boolean {
  const { source, start, end } = location
  const context = file.context.find((entry) => entry.side === source && entry.text !== null)
  if (context?.text) {
    const lineCount = context.text.split('\n').length
    const lastLine = lineCount - Number(context.text.endsWith('\n') || context.status === 'truncated')
    if (end <= lastLine) return true
  }
  if (source === 'base' || !file.patch) return false

  const patchLines = file.patch.split('\n')
  // A truncated patch may end mid-line. Only use its complete lines.
  if (file.patchStatus === 'truncated') patchLines.pop()
  const lines = new Set<number>()
  let current = 0
  for (const entry of patchLines) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(entry)
    if (hunk) {
      current = Number(hunk[source === 'head' ? 2 : 1])
      continue
    }
    if (!current) continue
    if (entry.startsWith(' ') || entry.startsWith(source === 'head' ? '+' : '-')) lines.add(current++)
  }

  if (end - start >= lines.size) return false
  for (let number = start; number <= end; number++) {
    if (!lines.has(number)) return false
  }
  return true
}

export function parseModelAnalysis(raw: string, evidence: CodeEvidence): ModelAnalysis {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('The model returned invalid JSON.')
  }

  if (!hasKeys(value, ['intent', 'findings']) || !text(value.intent, 600) ||
      !Array.isArray(value.findings) || !value.findings.every(validFinding)) {
    throw new Error('The model response did not match the Attention Report schema.')
  }

  const files = new Map(evidence.files.map((file) => [file.path, file]))
  for (const finding of value.findings) {
    const file = files.get(finding.file)
    if (!file || (finding.location && !matchesSource(file, finding.location))) {
      throw new Error('The model cited a file or line range outside the supplied code evidence.')
    }
    if (finding.level === 'high' && !file.patch && !file.context.some(({ text }) => text)) {
      throw new Error('The model reported a high-attention finding without code evidence.')
    }
  }
  return { intent: value.intent, findings: value.findings }
}
