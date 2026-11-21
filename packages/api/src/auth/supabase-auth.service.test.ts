import { UnauthorizedException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAuthService } from './supabase-auth.service'

const { getUserMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@supabase/supabase-js')>()

  return {
    ...actual,
    createClient: vi.fn(() => ({
      auth: {
        getUser: getUserMock,
      },
    })),
  }
})

function createConfig(values: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService
}

describe('SupabaseAuthService', () => {
  beforeEach(() => {
    getUserMock.mockReset()
  })

  it('requires Supabase configuration', () => {
    expect(() => new SupabaseAuthService(createConfig({}))).toThrow(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be configured',
    )
  })

  it('returns the verified Supabase user', async () => {
    const user = { id: 'user-1', email: 'learner@example.com' }
    getUserMock.mockResolvedValue({ data: { user }, error: null })

    await expect(
      new SupabaseAuthService(
        createConfig({
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
        }),
      ).verifyAccessToken('token'),
    ).resolves.toEqual(user)
    expect(getUserMock).toHaveBeenCalledWith('token')
  })

  it('rejects invalid tokens', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: new Error('invalid') })

    await expect(
      new SupabaseAuthService(
        createConfig({
          SUPABASE_URL: 'https://example.supabase.co',
          SUPABASE_ANON_KEY: 'anon-key',
        }),
      ).verifyAccessToken('bad-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
