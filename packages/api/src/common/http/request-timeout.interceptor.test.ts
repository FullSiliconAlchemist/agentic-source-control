import { RequestTimeoutException } from '@nestjs/common'
import { NEVER, firstValueFrom, of, throwError } from 'rxjs'
import { describe, expect, it, vi } from 'vitest'
import { RequestTimeoutInterceptor } from './request-timeout.interceptor'

describe('RequestTimeoutInterceptor', () => {
  it('allows responses that complete before the deadline', async () => {
    const interceptor = new RequestTimeoutInterceptor()

    await expect(
      firstValueFrom(
        interceptor.intercept({} as never, {
          handle: () => of({ ok: true }),
        }),
      ),
    ).resolves.toEqual({ ok: true })
  })

  it('converts RxJS timeout errors into HTTP request timeouts', async () => {
    vi.useFakeTimers()
    const interceptor = new RequestTimeoutInterceptor()
    const promise = firstValueFrom(
      interceptor.intercept({} as never, {
        handle: () => NEVER,
      }),
    )
    const expectation = expect(promise).rejects.toBeInstanceOf(RequestTimeoutException)

    await vi.runAllTimersAsync()

    await expectation
    vi.useRealTimers()
  })

  it('preserves non-timeout errors', async () => {
    const error = new Error('boom')
    const interceptor = new RequestTimeoutInterceptor()

    await expect(
      firstValueFrom(
        interceptor.intercept({} as never, {
          handle: () => throwError(() => error),
        }),
      ),
    ).rejects.toBe(error)
  })
})
