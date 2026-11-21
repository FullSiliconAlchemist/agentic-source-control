import { describe, expect, it, vi } from 'vitest'
import {
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  REQUEST_BODY_LIMIT,
  REQUEST_TIMEOUT_MS,
  applyBodyParserLimits,
  applyServerTimeouts,
} from './server-limits'

describe('server limits', () => {
  it('registers limited body parsers before routes handle requests', () => {
    const app = {
      useBodyParser: vi.fn(),
    }

    applyBodyParserLimits(app as never)

    expect(app.useBodyParser).toHaveBeenNthCalledWith(1, 'json', {
      limit: REQUEST_BODY_LIMIT,
    })
    expect(app.useBodyParser).toHaveBeenNthCalledWith(2, 'urlencoded', {
      extended: false,
      limit: REQUEST_BODY_LIMIT,
    })
  })

  it('sets inbound HTTP server timeouts', () => {
    const server = {
      requestTimeout: 0,
      headersTimeout: 0,
      keepAliveTimeout: 0,
    }

    applyServerTimeouts(server as never)

    expect(server).toMatchObject({
      requestTimeout: REQUEST_TIMEOUT_MS,
      headersTimeout: HEADERS_TIMEOUT_MS,
      keepAliveTimeout: KEEP_ALIVE_TIMEOUT_MS,
    })
  })
})
