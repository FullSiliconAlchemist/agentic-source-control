import { describe, expect, it, vi } from 'vitest'
import snapshot from '../reports/fixtures/prettier-20305.json'
import { fetchPullRequest } from './pull-request'

const metadata = {
  html_url: snapshot.url,
  number: snapshot.number,
  title: snapshot.title,
  body: snapshot.description,
  changed_files: snapshot.changedFiles,
  base: { sha: snapshot.baseSha, repo: { full_name: snapshot.repository, private: false } },
  head: { sha: snapshot.headSha },
}

const rawFiles = snapshot.files.map(({ path, ...file }) => ({ filename: path, ...file }))

describe('fetchPullRequest', () => {
  it('normalizes GitHub responses to the saved public PR snapshot', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(Response.json(rawFiles))

    await expect(fetchPullRequest(snapshot.repository, snapshot.number, { fetch })).resolves.toEqual(snapshot)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('fetches multiple pages and records a missing patch as null', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      ...rawFiles[0],
      filename: `files/file-${index}.txt`,
    }))
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ ...metadata, changed_files: 101 }))
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([
        { filename: 'assets/icon.png', status: 'modified', additions: 0, deletions: 0 },
      ]))

    const pr = await fetchPullRequest(snapshot.repository, snapshot.number, { fetch })
    expect(pr.files).toHaveLength(101)
    expect(pr.files.at(-1)).toMatchObject({ path: 'assets/icon.png', patch: null })
    expect(fetch.mock.calls.slice(1).map(([url]) => String(url))).toEqual([
      `https://api.github.com/repos/${snapshot.repository}/pulls/${snapshot.number}/files?per_page=100&page=1`,
      `https://api.github.com/repos/${snapshot.repository}/pulls/${snapshot.number}/files?per_page=100&page=2`,
    ])
  })

  it('requires opt-in before fetching files from a private repository', async () => {
    const privateMetadata = { ...metadata, base: { ...metadata.base, repo: { ...metadata.base.repo, private: true } } }
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(privateMetadata))
      .mockResolvedValueOnce(Response.json(privateMetadata))
      .mockResolvedValueOnce(Response.json(rawFiles))
    const options = { fetch, token: 'fake-token' }

    await expect(fetchPullRequest(snapshot.repository, snapshot.number, options)).rejects.toThrow('explicit opt-in')
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(fetchPullRequest(snapshot.repository, snapshot.number, { ...options, allowPrivate: true }))
      .resolves.toEqual(snapshot)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('reports which request failed and its status', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(metadata))
      .mockResolvedValueOnce(new Response(null, { status: 403 }))

    await expect(fetchPullRequest(snapshot.repository, snapshot.number, { fetch }))
      .rejects.toThrow('GitHub returned HTTP 403 for PR files page 1')
  })
})
