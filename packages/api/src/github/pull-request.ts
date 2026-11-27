import { githubHost } from './host'

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
  host?: string
  allowPrivate?: boolean
  fetch?: typeof globalThis.fetch
}

const PAGE_SIZE = 100
const MAX_FILES = 3_000

function githubRequest(
  repository: string,
  number: number,
  options: FetchPullRequestOptions = {},
) {
  if (!/^[a-z\d-]+\/(?!\.{1,2}$)[a-z\d._-]+$/i.test(repository) ||
      !Number.isSafeInteger(number) || number < 1) {
    throw new Error('Expected a GitHub repository in owner/repo format and a positive PR number.')
  }

  const fetch = options.fetch ?? globalThis.fetch
  const host = githubHost(options.host)
  const endpoint = `${host.api}/repos/${repository}`
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': host.version,
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

  return get
}

async function metadata(get: ReturnType<typeof githubRequest>, number: number, options: FetchPullRequestOptions) {
  const pr = await get<GitHubPullRequest>(`/pulls/${number}`, 'PR metadata')
  if (pr.base.repo.private !== false && !options.allowPrivate) {
    throw new Error('This repository requires explicit opt-in to fetch its PR files. Use --allow-private.')
  }

  return pr
}

export async function fetchComparison(repository: string, number: number, options: FetchPullRequestOptions = {}) {
  const get = githubRequest(repository, number, options)
  const pr = await metadata(get, number, options)
  const base = pr.base.sha
  const head = pr.head.sha
  const sha = /^[0-9a-f]{40}$/
  if (!sha.test(base) || !sha.test(head)) throw new Error('GitHub returned an invalid revision.')
  const comparison = await get<{ merge_base_commit: { sha: string } }>(
    `/compare/${base}...${head}?per_page=1`, 'merge base')
  const mergeBase = comparison.merge_base_commit?.sha
  if (!sha.test(mergeBase)) throw new Error('GitHub returned an invalid merge base.')
  return { base, head, mergeBase }
}

export async function fetchPullRequest(repository: string, number: number, options: FetchPullRequestOptions = {}): Promise<PullRequest> {
  const get = githubRequest(repository, number, options)
  const pr = await metadata(get, number, options)
  const files: ChangedFile[] = []
  const pages = Math.ceil(Math.min(pr.changed_files, MAX_FILES) / PAGE_SIZE)
  for (let page = 1; page <= pages; page++) {
    const batch = await get<GitHubChangedFile[]>(`/pulls/${number}/files?per_page=${PAGE_SIZE}&page=${page}`, `PR files page ${page}`)
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
