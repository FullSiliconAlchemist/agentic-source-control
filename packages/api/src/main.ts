import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import { RequestTimeoutInterceptor } from './common/http/request-timeout.interceptor'
import { applyBodyParserLimits, applyServerTimeouts } from './common/http/server-limits'
import { createValidationPipe } from './common/http/validation'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })

  const { CORS_ORIGIN, PORT } = process.env

  const corsOrigin = parseCorsOrigin(CORS_ORIGIN)

  applyBodyParserLimits(app)
  app.set('trust proxy', 1)
  app.enableCors({ origin: corsOrigin })

  app.useGlobalPipes(createValidationPipe())
  app.useGlobalInterceptors(new RequestTimeoutInterceptor())

  const port = PORT ?? 3000
  await app.listen(port)
  applyServerTimeouts(app.getHttpServer())
  console.log(`[Quickstart API] listening on port ${port}`)
}

function parseCorsOrigin(corsOrigin?: string) {
  if (!corsOrigin || corsOrigin.trim() === '*') {
    return '*'
  }

  return corsOrigin
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

bootstrap()
