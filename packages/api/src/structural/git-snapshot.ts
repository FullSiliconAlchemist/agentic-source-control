import { execFileSync } from 'node:child_process'

export function git(dir: string, args: string[], env = process.env) {
  return execFileSync('git', args, { cwd: dir, encoding: 'utf8', env, maxBuffer: 128 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'] })
}

export function resolveCommit(dir: string, revision: string) {
  return git(dir, ['rev-parse', '--verify', '--end-of-options', revision + '^{commit}']).trim()
}

export function readSnapshot(dir: string, revision: string) {
  const entries = new Map<string, string>()
  const sources = new Map<string, string>()
  const gaps: { file: string; reason: string }[] = []
  const blobs = new Map<string, string[]>()
  const tree = git(dir, ['ls-tree', '-rz', '--full-tree', revision])
  for (const record of tree.split('\0')) {
    if (!record) continue
    const tab = record.indexOf('\t')
    const header = record.slice(0, tab)
    const file = record.slice(tab + 1)
    const [mode, , oid] = header.split(' ')
    entries.set(file, header)
    if (!/\.(?:[cm]?[jt]s|[jt]sx)$/i.test(file)) continue
    if (!mode.startsWith('100')) {
      gaps.push({ file, reason: 'Source path is not a regular Git blob' })
      continue
    }
    const paths = blobs.get(oid) ?? []
    paths.push(file)
    blobs.set(oid, paths)
  }
  // Batch by object size so a repository does not need one subprocess per source file.
  const ids = [...blobs.keys()]
  function batch(args: string[], objects: string[], limit: number) {
    return execFileSync('git', ['cat-file', ...args], { cwd: dir, input: objects.join('\n') + '\n', maxBuffer: limit })
  }
  for (let start = 0; start < ids.length; start += 512) {
    const group = ids.slice(start, start + 512)
    const sizes = batch(['--batch-check=%(objectsize)'], group, 65536).toString().trimEnd().split('\n').map(Number)
    let pending: string[] = []
    let bytes = 0
    function flush() {
      if (!pending.length) return
      const data = batch(['--batch'], pending, bytes + pending.length * 128)
      let offset = 0
      for (const id of pending) {
        const end = data.indexOf(10, offset)
        const [oid, type, size] = data.toString('ascii', offset, end).split(' ')
        if (oid !== id || type !== 'blob') throw new Error('Unexpected Git blob response')
        const content = data.subarray(end + 1, end + 1 + Number(size))
        offset = end + 2 + Number(size)
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(content)
          for (const path of blobs.get(id)!) sources.set(path, text)
        } catch {
          for (const file of blobs.get(id)!) gaps.push({ file, reason: 'Invalid UTF-8 source' })
        }
      }
      pending = []
      bytes = 0
    }
    for (const [index, id] of group.entries()) {
      const size = sizes[index]
      if (!Number.isSafeInteger(size) || size < 0) throw new Error('Invalid Git blob size')
      if (size > 2 * 1024 * 1024) {
        for (const file of blobs.get(id)!) gaps.push({ file, reason: 'Source exceeds 2 MiB analysis limit' })
        continue
      }
      if (bytes + size > 8 * 1024 * 1024) flush()
      pending.push(id)
      bytes += size
    }
    flush()
  }
  return { entries, sources, gaps }
}
