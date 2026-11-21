import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module'
import { throttlerOptions } from './common/rate-limit/rate-limit.config'
import { HealthController } from './health.controller'

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot(throttlerOptions),
    AuthModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
