import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Always skip rate limiting for admin users
    if (request.user?.role === 'ADMIN') {
      return true;
    }
    
    // Skip rate limiting for admin panel requests: configured ADMIN_URL or a
    // stefanos-admin*.vercel.app deployment/preview origin.
    const origin = request.headers.origin || '';
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:3002';
    if (origin === adminUrl || /^https:\/\/stefanos-admin[a-z0-9-]*\.vercel\.app$/i.test(origin)) {
      return true;
    }
    
    // Apply rate limiting for all other requests
    return super.canActivate(context);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use user ID if authenticated, otherwise use IP
    return req.user?.id || req.user?.userId || req.ip || req.connection?.remoteAddress;
  }

  protected async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests, please try again later',
        retryAfter: this.getRetryAfter(context),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getRetryAfter(context: ExecutionContext): number {
    const request = context.switchToHttp().getRequest();
    const ttl = request._rateLimitTtl || 60;
    return Math.ceil(ttl / 1000);
  }
}

