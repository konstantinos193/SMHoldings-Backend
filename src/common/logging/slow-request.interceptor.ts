import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AppLogger } from './app-logger.service';

const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 2000);

/**
 * Laravel 'performance' channel equivalent: requests slower than
 * SLOW_REQUEST_MS (default 2000, matching Laravel's slow_request_threshold)
 * land in performance-YYYY-MM-DD.log.
 */
@Injectable()
export class SlowRequestInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();
    return next.handle().pipe(
      tap(() => {
        const ms = Date.now() - start;
        if (ms < SLOW_REQUEST_MS) return;
        const req = context.switchToHttp().getRequest();
        const res = context.switchToHttp().getResponse();
        this.logger.channel('performance').warn('Slow request', {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          durationMs: ms,
          ip: req.ip,
        });
      }),
    );
  }
}
