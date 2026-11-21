import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Server } from 'node:http'

export const REQUEST_BODY_LIMIT = '32kb'
export const REQUEST_TIMEOUT_MS = 30_000
export const HEADERS_TIMEOUT_MS = 10_000
export const KEEP_ALIVE_TIMEOUT_MS = 5_000

export function applyBodyParserLimits(app: NestExpressApplication) {
  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT })
  app.useBodyParser('urlencoded', {
    extended: false,
    limit: REQUEST_BODY_LIMIT,
  })
}

export function applyServerTimeouts(server: Server) {
  server.requestTimeout = REQUEST_TIMEOUT_MS
  server.headersTimeout = HEADERS_TIMEOUT_MS
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
}
