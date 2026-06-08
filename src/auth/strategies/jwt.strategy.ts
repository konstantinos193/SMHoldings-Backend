import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';

const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
    const cached = await this.cache.get<{ id: string; email: string; role: string }>(cacheKey);
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
    await this.cache.set(cacheKey, { id: user.id, email: user.email, role: user.role }, USER_CACHE_TTL_MS);
    return result;
  }
}

