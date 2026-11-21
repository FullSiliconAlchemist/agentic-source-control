import { Controller, Get, Logger } from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  @Get('health')
  @SkipThrottle()
  health() {
    try {
      this.logger.log('Health check requested')
      return {
        ok: true,
        service: 'quickstart-template-api',
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      this.logError('Health check failed', error)
      throw error
    }
  }

  private logError(message: string, error: unknown) {
    if (error instanceof Error) {
      this.logger.error(message, error.stack)
      return
    }

    this.logger.error(message, String(error))
  }
}
