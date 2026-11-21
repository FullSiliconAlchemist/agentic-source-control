import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { HealthController } from '../../health.controller'
import { DEFAULT_RATE_LIMIT, RATE_LIMIT_WINDOW_MS, throttlerOptions } from './rate-limit.config'

const THROTTLER_SKIP = 'THROTTLER:SKIPdefault'

describe('rate limit metadata', () => {
  it('keeps the default throttler configuration available globally', () => {
    expect(throttlerOptions).toEqual([
      {
        name: 'default',
        ttl: RATE_LIMIT_WINDOW_MS,
        limit: DEFAULT_RATE_LIMIT,
      },
    ])
  })

  it('exempts the load balancer health check', () => {
    expect(Reflect.getMetadata(THROTTLER_SKIP, HealthController.prototype.health)).toBe(true)
  })
})
