import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { SupabaseAuthService } from './supabase-auth.service'

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(private readonly authService: SupabaseAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>
      user?: unknown
    }>()
    const accessToken = this.getBearerToken(request.headers.authorization)

    if (!accessToken) {
      throw new UnauthorizedException('Missing bearer authentication token')
    }

    request.user = await this.authService.verifyAccessToken(accessToken)
    return true
  }

  private getBearerToken(authorization: string | string[] | undefined) {
    if (typeof authorization !== 'string') {
      return undefined
    }

    const [scheme, token] = authorization.split(' ')
    if (scheme !== 'Bearer' || !token) {
      return undefined
    }

    return token
  }
}
