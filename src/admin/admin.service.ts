import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboardStats() {
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
      this.prisma.booking.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
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

    return {
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

