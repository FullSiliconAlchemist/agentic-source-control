import { UnauthorizedException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SupabaseAuthGuard } from './supabase-auth.guard'
import type { SupabaseAuthService } from './supabase-auth.service'

function createContext(authorization?: string): ExecutionContext {
  const request = {
    headers: {
      authorization,
    },
  }

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext
}

describe('SupabaseAuthGuard', () => {
  const verifyAccessToken = vi.fn()
  const authService = { verifyAccessToken } as unknown as SupabaseAuthService

  beforeEach(() => {
    verifyAccessToken.mockReset()
  })

  it('attaches the verified user to the request', async () => {
    const user = { id: 'user-1' }
    verifyAccessToken.mockResolvedValue(user)
    const context = createContext('Bearer access-token')

    await expect(new SupabaseAuthGuard(authService).canActivate(context)).resolves.toBe(true)
    expect(verifyAccessToken).toHaveBeenCalledWith('access-token')
    expect(context.switchToHttp().getRequest().user).toEqual(user)
  })

  it('rejects requests without a bearer token', async () => {
    await expect(new SupabaseAuthGuard(authService).canActivate(createContext())).rejects.toBeInstanceOf(
      UnauthorizedException,
    )
    await expect(
      new SupabaseAuthGuard(authService).canActivate(createContext('Basic token')),
    ).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
