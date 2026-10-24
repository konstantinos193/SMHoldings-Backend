import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private store: RateLimitStore = {};
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Clean up expired entries every minute
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), 60000);
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip rate limiting for admin users
    const user = (req as any).user;
    if (user?.role === 'ADMIN') {
      return next();
    }
    
    // Skip rate limiting for admin panel requests: configured ADMIN_URL or a
    // stefanos-admin*.vercel.app deployment/preview origin.
    const origin = req.headers.origin || '';
    const adminUrl = process.env.ADMIN_URL || 'http://localhost:3002';
    if (origin === adminUrl || /^https:\/\/stefanos-admin[a-z0-9-]*\.vercel\.app$/i.test(origin)) {
      return next();
    }
    
    const key = this.getKey(req);
    const now = Date.now();
    const record = this.store[key];

    if (!record || now > record.resetTime) {
      // Create new record or reset expired one
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
      this.setHeaders(res, this.maxRequests, 1, this.windowMs);
      return next();
    }

    if (record.count >= this.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      this.setHeaders(res, this.maxRequests, record.count, this.windowMs, retryAfter);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests, please try again later',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    this.setHeaders(res, this.maxRequests, record.count, this.windowMs);
    next();
  }

  private getKey(req: Request): string {
    // Use user ID if authenticated, otherwise use IP
    const user = (req as any).user;
    if (user?.id || user?.userId) {
      return `user:${user.id || user.userId}`;
    }
    return `ip:${req.ip || (req as any).connection?.remoteAddress || 'unknown'}`;
  }

  private setHeaders(
    res: Response,
    limit: number,
    remaining: number,
    windowMs: number,
    retryAfter?: number,
  ): void {
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, limit - remaining));
    res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());
    if (retryAfter) {
      res.setHeader('Retry-After', retryAfter);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    Object.keys(this.store).forEach((key) => {
      if (this.store[key].resetTime < now) {
        delete this.store[key];
      }
    });
  }
}
