import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  RequestTimeoutException,
} from '@nestjs/common'
import { Observable, TimeoutError, catchError, throwError, timeout } from 'rxjs'
import { REQUEST_TIMEOUT_MS } from './server-limits'

@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      timeout(REQUEST_TIMEOUT_MS),
      catchError((error: unknown) => {
        if (error instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException())
        }

        return throwError(() => error)
      }),
    )
  }
}
