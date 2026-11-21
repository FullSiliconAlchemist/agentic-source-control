import { afterEach, describe, expect, it, vi } from 'vitest'
import snapshot from '../reports/fixtures/prettier-20305.json'
import { fetchFileContext } from './file-content'

afterEach(() => vi.unstubAllGlobals())

describe('fetchFileContext', () => {
  it('reads pinned raw content and truncates at a UTF-8 character boundary', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('abcédef'))
    vi.stubGlobal('fetch', fetch)

    await expect(fetchFileContext(snapshot, 'src/a b.js', 'head', 4))
      .resolves.toEqual({ status: 'truncated', text: 'abc' })
    expect(fetch).toHaveBeenCalledWith(
      `https://api.github.com/repos/prettier/prettier/contents/src/a%20b.js?ref=${snapshot.headSha}`,
      expect.objectContaining({ headers: expect.objectContaining({ Accept: 'application/vnd.github.raw+json' }) }),
    )
  })

  it('reports missing and binary content as unavailable', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response('binary\0content'))
    vi.stubGlobal('fetch', fetch)

    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(fetchFileContext(snapshot, 'src/a.js', 'base', 20))
        .resolves.toEqual({ status: 'unavailable', text: null })
    }
  })
})
