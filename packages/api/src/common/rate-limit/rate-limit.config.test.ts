import { describe, expect, it } from 'vitest'
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS, throttlerOptions } from './rate-limit.config'

describe('rate limit configuration', () => {
  it('uses a one-minute global rate limit window', () => {
    expect(RATE_LIMIT_WINDOW_MS).toBe(60_000)
    expect(throttlerOptions).toEqual([
      {
        name: 'default',
        ttl: RATE_LIMIT_WINDOW_MS,
        limit: DEFAULT_RATE_LIMIT,
      },
    ])
  })

  it('uses a conservative default request limit', () => {
    expect(DEFAULT_RATE_LIMIT).toBe(60)
  })
})
