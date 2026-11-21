import { TextDecoder } from 'node:util'
import type { PullRequest } from './pull-request'

export interface FileContext {
  status: 'included' | 'truncated' | 'unavailable'
  text: string | null
}

export async function fetchFileContext(
  pr: PullRequest,
  path: string,
  side: 'base' | 'head',
  maxBytes: number,
  token?: string,
): Promise<FileContext> {
  const sha = side === 'base' ? pr.baseSha : pr.headSha
  const segments = path.split('/')
  const unavailable: FileContext = { status: 'unavailable', text: null }
  if (!/^[a-f\d]{40}$/i.test(sha) ||
      !/^[a-z\d-]+\/(?!\.{1,2}$)[a-z\d._-]+$/i.test(pr.repository) ||
      segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return unavailable
  }

  const encodedPath = segments.map(encodeURIComponent).join('/')
  try {
    const response = await fetch(
      `https://api.github.com/repos/${pr.repository}/contents/${encodedPath}?ref=${sha}`,
      {
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'X-GitHub-Api-Version': '2026-03-10',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!response.ok || !response.body) {
      await response.body?.cancel()
      return unavailable
    }

    const decoder = new TextDecoder('utf-8', { fatal: true })
    const reader = response.body.getReader()
    let remaining = maxBytes
    let text = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) return { status: 'included', text: text + decoder.decode() }
        text += decoder.decode(value.subarray(0, remaining), { stream: true })
        if (text.includes('\0')) return unavailable
        if (value.length > remaining) return { status: 'truncated', text }
        remaining -= value.length
      }
    } finally {
      await reader.cancel().catch(() => {})
    }
  } catch {
    return unavailable
  }
}
