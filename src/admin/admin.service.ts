import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

const DASHBOARD_KEY = 'admin:dashboard';
const DASHBOARD_TTL_MS = 30 * 1000; // rollup counters; 30s of staleness is fine
// Cache is a latency optimization, never a hard dependency. Bound every cache op so a
// degraded Redis can only ever cost this much (KeyvRedis alone waits out its 2s
// connectionTimeout, which is what made cached endpoints take seconds).
const CACHE_TIMEOUT_MS = 200;

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async getDashboardStats() {
    const cached = await this.safeCacheGet<any>(DASHBOARD_KEY);
    if (cached) return cached;

    const [
      totalUsers,
      totalProperties,
      bookingCounts,
      totalRevenue,
      recentBookings,
      recentUsers,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.property.count(),
      this.prisma.booking.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.booking.aggregate({
        _sum: { totalPrice: true },
        where: { paymentStatus: 'COMPLETED' },
      }),
      // Select only what the dashboard renders. `include` alone pulled every booking
      // column (externalData, iCalUid, specialRequests, ...) and dominated the payload.
      this.prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          checkIn: true,
          checkOut: true,
          totalPrice: true,
          guestName: true,
          createdAt: true,
          property: { select: { titleEn: true, titleGr: true } },
          guest: { select: { name: true, email: true } },
        },
      }),
      this.prisma.user.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      }),
    ]);

    const totalBookings = bookingCounts.reduce((sum, b) => sum + b._count.id, 0);
    const activeBookings = bookingCounts
      .filter((b) => b.status === 'CONFIRMED' || b.status === 'CHECKED_IN')
      .reduce((sum, b) => sum + b._count.id, 0);
    const pendingBookings = bookingCounts.find((b) => b.status === 'PENDING')?._count.id ?? 0;

    const result = {
      overview: {
        totalUsers,
        totalProperties,
        totalBookings,
        totalRevenue: totalRevenue._sum.totalPrice || 0,
        activeBookings,
        pendingBookings,
      },
      recentBookings,
      recentUsers,
    };

    // Fire-and-forget: never await the cache write on the request path.
    this.safeCacheSet(DASHBOARD_KEY, result);
    return result;
  }

  /** Best-effort cache read bounded by a hard timeout. Undefined on miss/slow/error. */
  private async safeCacheGet<T>(key: string): Promise<T | undefined> {
    try {
      const result = await Promise.race([
        this.cache.get<T>(key),
        new Promise<undefined>((_, reject) =>
          setTimeout(() => reject(new Error('cache get timeout')), CACHE_TIMEOUT_MS),
        ),
      ]);
      return result ?? undefined;
    } catch {
      return undefined;
    }
  }

  /** Best-effort cache write. Errors/timeouts are swallowed so they can never block. */
  private safeCacheSet(key: string, value: unknown): void {
    Promise.race([
      this.cache.set(key, value, DASHBOARD_TTL_MS),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('cache set timeout')), CACHE_TIMEOUT_MS),
      ),
    ]).catch(() => undefined);
  }

  async getAllUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,
          _count: {
            select: {
              properties: true,
              bookings: true,
            },
          },
        },
      }),
      this.prisma.user.count(),
    ]);

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAllProperties(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      this.prisma.property.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              bookings: true,
              reviews: true,
            },
          },
        },
      }),
      this.prisma.property.count(),
    ]);

    return {
      properties,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getAllBookings(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: {
            select: {
              id: true,
              titleEn: true,
              titleGr: true,
            },
          },
          guest: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.booking.count(),
    ]);

    return {
      bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateUserRole(userId: string, newRole: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole as any },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async toggleUserStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: !user.isActive },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });
  }

  async getAuditLogs(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getFinancialReport(startDate: Date, endDate: Date) {
    const where = {
      createdAt: { gte: startDate, lte: endDate },
      paymentStatus: 'COMPLETED' as const,
    };

    const [summary, bookings] = await Promise.all([
      this.prisma.booking.aggregate({
        where,
        _sum: { totalPrice: true, platformFee: true, ownerRevenue: true },
        _count: { id: true },
      }),
      this.prisma.booking.findMany({
        where,
        select: {
          id: true,
          totalPrice: true,
          platformFee: true,
          ownerRevenue: true,
          createdAt: true,
          property: {
            select: {
              titleEn: true,
              owner: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      period: { startDate, endDate },
      summary: {
        totalBookings: summary._count.id,
        totalRevenue: summary._sum.totalPrice || 0,
        totalPlatformFees: summary._sum.platformFee || 0,
        totalOwnerRevenue: summary._sum.ownerRevenue || 0,
      },
      bookings: bookings.map((b) => ({
        id: b.id,
        property: b.property?.titleEn ?? null,
        owner: b.property?.owner?.name ?? null,
        totalPrice: b.totalPrice,
        platformFee: b.platformFee,
        ownerRevenue: b.ownerRevenue,
        createdAt: b.createdAt,
      })),
    };
  }
}

