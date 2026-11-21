import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, SupabaseClient, User } from '@supabase/supabase-js'

@Injectable()
export class SupabaseAuthService {
  private readonly client: SupabaseClient

  constructor(configService: ConfigService) {
    const supabaseUrl = configService.get<string>('SUPABASE_URL')
    const supabaseAnonKey = configService.get<string>('SUPABASE_ANON_KEY')

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured')
    }

    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async verifyAccessToken(accessToken: string): Promise<User> {
    const { data, error } = await this.client.auth.getUser(accessToken)

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired authentication token')
    }

    return data.user
  }
}
