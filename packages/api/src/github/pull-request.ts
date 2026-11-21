interface GitHubPullRequest {
  html_url: string
  number: number
  title: string
  body: string | null
  changed_files: number
  base: { sha: string; repo: { full_name: string; private: boolean } }
  head: { sha: string }
}

interface GitHubChangedFile {
  filename: string
  previous_filename?: string
  status: string
  additions: number
  deletions: number
  patch?: string | null
}

export interface ChangedFile {
  path: string
  previousPath?: string
  status: string
  additions: number
  deletions: number
  patch: string | null
}

export interface PullRequest {
  repository: string
  number: number
  url: string
  title: string
  description: string | null
  baseSha: string
  headSha: string
  changedFiles: number
  files: ChangedFile[]
}

interface FetchPullRequestOptions {
  token?: string
  allowPrivate?: boolean
  fetch?: typeof globalThis.fetch
}

const PAGE_SIZE = 100
const MAX_FILES = 3_000

export async function fetchPullRequest(
  repository: string,
  number: number,
  options: FetchPullRequestOptions = {},
): Promise<PullRequest> {
  if (!/^[a-z\d-]+\/(?!\.{1,2}$)[a-z\d._-]+$/i.test(repository) ||
      !Number.isSafeInteger(number) || number < 1) {
    throw new Error('Expected a GitHub repository in owner/repo format and a positive PR number.')
  }

  const fetch = options.fetch ?? globalThis.fetch
  const endpoint = `https://api.github.com/repos/${repository}/pulls/${number}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2026-03-10',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
  }
  const signal = AbortSignal.timeout(20_000)

  async function get<T>(suffix: string, resource: string): Promise<T> {
    let response: Response
    try {
      response = await fetch(endpoint + suffix, { headers, signal })
    } catch {
      throw new Error(`Could not fetch GitHub ${resource} for ${repository} #${number}.`)
    }
    if (!response.ok) {
      throw new Error(`GitHub returned HTTP ${response.status} for ${resource} on ${repository} #${number}.`)
    }
    try {
      return await response.json() as T
    } catch {
      throw new Error(`GitHub returned invalid JSON for ${resource} on ${repository} #${number}.`)
    }
  }

  const pr = await get<GitHubPullRequest>('', 'PR metadata')
  if (pr.base.repo.private !== false && !options.allowPrivate) {
    throw new Error('This repository requires explicit opt-in to fetch its PR files. Use --allow-private.')
  }

  const files: ChangedFile[] = []
  const pages = Math.ceil(Math.min(pr.changed_files, MAX_FILES) / PAGE_SIZE)
  for (let page = 1; page <= pages; page++) {
    const batch = await get<GitHubChangedFile[]>(`/files?per_page=${PAGE_SIZE}&page=${page}`, `PR files page ${page}`)
    files.push(...batch.map((file) => ({
      path: file.filename,
      ...(file.previous_filename ? { previousPath: file.previous_filename } : {}),
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch || null,
    })))
  }

  return {
    repository: pr.base.repo.full_name,
    number: pr.number,
    url: pr.html_url,
    title: pr.title,
    description: pr.body,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    changedFiles: pr.changed_files,
    files,
  }
}
