import { extname } from 'node:path'
import { TextDecoder } from 'node:util'
import type { FileContext } from '../github/file-content'
import type { ChangedFile, PullRequest } from '../github/pull-request'

const MAX_FILES = 200
const PATCH_BYTES = 48_000
const PATCH_BYTES_PER_FILE = 12_000
const CONTEXT_READS = 6
const CONTEXT_BYTES_PER_READ = 4_000
const DESCRIPTION_BYTES = 8_000

type FileContextReader = (
  path: string,
  side: 'base' | 'head',
  maxBytes: number,
) => Promise<FileContext>

function fileSignals(file: ChangedFile) {
  const paths = [file.path, file.previousPath ?? '']
  return {
    extension: extname(file.path),
    test: paths.some((path) => /(?:^|\/)(?:__tests__|tests?|specs?)\/|(?:^|[._-])(?:test|spec)\.[^/]+$/i.test(path)),
    generated: /(?:^|\/)(?:__generated__|generated|__snapshots__)\/|\.generated\.|\.snap$|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i.test(file.path),
    migration: paths.some((path) => /(?:^|\/)(?:migrations?|alembic)\//i.test(path)),
    sensitive: paths.some((path) => /auth|billing|payments?|permissions?|security/i.test(path)),
    changedLines: file.additions + file.deletions,
  }
}

function utf8Prefix(text: string, maxBytes: number) {
  const bytes = Buffer.from(text)
  return bytes.length <= maxBytes ? text :
    new TextDecoder().decode(bytes.subarray(0, maxBytes), { stream: true })
}

function hasCompletePatch(file: ChangedFile) {
  const lines = file.patch?.split('\n') ?? []
  return lines.filter((line) => line.startsWith('+')).length === file.additions &&
    lines.filter((line) => line.startsWith('-')).length === file.deletions
}

export async function buildCodeEvidence(pr: PullRequest, readContext: FileContextReader) {
  const ranked = pr.files.map((file) => ({ file, signals: fileSignals(file) }))
  const priority = ({ signals }: typeof ranked[number]) =>
    signals.test || signals.generated ? 2 : signals.migration || signals.sensitive ? 0 : 1
  ranked.sort((a, b) => priority(a) - priority(b))

  let patchBytesRemaining = PATCH_BYTES
  let contextReads = 0
  const files = []
  for (const { file, signals } of ranked.slice(0, MAX_FILES)) {
    const patch = file.patch && patchBytesRemaining
      ? utf8Prefix(file.patch, Math.min(patchBytesRemaining, PATCH_BYTES_PER_FILE)) || null
      : null
    patchBytesRemaining -= patch ? Buffer.byteLength(patch) : 0
    const patchStatus = !file.patch ? 'unavailable' : !patch ? 'omitted' :
      patch !== file.patch || !hasCompletePatch(file) ? 'truncated' : 'included'

    const needsContext = !signals.test && !signals.generated && signals.changedLines > 0 &&
      (patchStatus !== 'included' || signals.changedLines <= 20)
    const context = []
    if (needsContext) {
      const sides: ('base' | 'head')[] = file.status === 'removed' ? ['base'] : ['head']
      if (file.status !== 'removed' && file.deletions > 0 && patchStatus !== 'included') sides.push('base')

      for (const side of sides) {
        const path = side === 'base' ? file.previousPath ?? file.path : file.path
        const sha = side === 'base' ? pr.baseSha : pr.headSha
        if (contextReads >= CONTEXT_READS) {
          context.push({ path, side, sha, status: 'omitted' as const, text: null })
          continue
        }
        contextReads++
        const result = await readContext(path, side, CONTEXT_BYTES_PER_READ)
        context.push({ path, side, sha, ...result })
      }
    }

    files.push({
      path: file.path,
      previousPath: file.previousPath,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      signals,
      patch,
      patchStatus,
      context,
    })
  }

  const { repository, number, url, title, description, baseSha, headSha, changedFiles } = pr
  const descriptionExcerpt = description === null ? null : utf8Prefix(description, DESCRIPTION_BYTES)
  return {
    repository, number, url, title, baseSha, headSha,
    description: descriptionExcerpt,
    files,
    coverage: {
      changedFiles,
      filesIncluded: files.length,
      descriptionTruncated: descriptionExcerpt !== description,
      limitedPatches: files.filter((file) => file.patchStatus !== 'included')
        .map(({ path, patchStatus }) => ({ path, status: patchStatus })),
      limitedContext: files.flatMap(({ context }) => context.filter(({ status }) => status !== 'included')
        .map(({ path, side, status }) => ({ path, side, status }))),
    },
  }
}
