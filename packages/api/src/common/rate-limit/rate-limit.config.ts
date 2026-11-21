import { minutes } from '@nestjs/throttler'

export const RATE_LIMIT_WINDOW_MS = minutes(1)
export const DEFAULT_RATE_LIMIT = 60

export const throttlerOptions = [
  {
    name: 'default',
    ttl: RATE_LIMIT_WINDOW_MS,
    limit: DEFAULT_RATE_LIMIT,
  },
]
