import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';

const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
// Cache is a latency optimization, never a hard dependency. If Redis is slow or
// unreachable, auth must still succeed via the DB. Cap cache reads so a degraded
// Redis can never block the request lifecycle (the cause of authenticated 502s).
const CACHE_READ_TIMEOUT_MS = 800;

type CachedUser = { id: string; email: string; role: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    const cacheKey = `jwt_user:${payload.userId}`;

    const cached = await this.safeCacheGet(cacheKey);
    if (cached) {
      return { id: cached.id, userId: cached.id, email: cached.email, role: cached.role };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const result = { id: user.id, userId: user.id, email: user.email, role: user.role };
    // Fire-and-forget: never await the cache write on the request path.
    this.safeCacheSet(cacheKey, { id: user.id, email: user.email, role: user.role });
    return result;
  }

  /** Best-effort cache read bounded by a hard timeout. Returns undefined on miss/slow/error. */
  private async safeCacheGet(key: string): Promise<CachedUser | undefined> {
    const start = Date.now();
    try {
      const result = await Promise.race([
        this.cache.get<CachedUser>(key),
        new Promise<undefined>((_, reject) =>
          setTimeout(() => reject(new Error('cache get timeout')), CACHE_READ_TIMEOUT_MS),
        ),
      ]);
      const duration = Date.now() - start;
      if (duration > 200) {
        this.logger.warn(`Slow cache.get (${duration}ms) for ${key}`);
      }
      return result ?? undefined;
    } catch (error: any) {
      this.logger.warn(
        `cache.get unavailable after ${Date.now() - start}ms for ${key}, falling back to DB: ${error?.message}`,
      );
      return undefined;
    }
  }

  /** Best-effort cache write. Errors/timeouts are swallowed so they can never block auth. */
  private safeCacheSet(key: string, value: CachedUser): void {
    Promise.race([
      this.cache.set(key, value, USER_CACHE_TTL_MS),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('cache set timeout')), CACHE_READ_TIMEOUT_MS),
      ),
    ]).catch((error: any) => {
      this.logger.warn(`cache.set unavailable for ${key}: ${error?.message}`);
    });
  }
}

