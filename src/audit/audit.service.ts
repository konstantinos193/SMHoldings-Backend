import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogsQueryDto } from './dto/audit-logs-query.dto';
import { getPagination } from '../common/utils/pagination.util';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  /**
   * A bare "2026-08-30" parses as UTC midnight, so the range both started three
   * hours late and excluded everything logged on the end day. Treat a date-only
   * value as a local calendar day.
   */
  private dayBound(value: string, edge: 'start' | 'end'): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return new Date(value);

    const [, y, m, d] = match;
    return edge === 'start'
      ? new Date(+y, +m - 1, +d, 0, 0, 0, 0)
      : new Date(+y, +m - 1, +d, 23, 59, 59, 999);
  }

  private startOfDay(value: string): Date {
    return this.dayBound(value, 'start');
  }

  private endOfDay(value: string): Date {
    return this.dayBound(value, 'end');
  }

  async getAuditLogs(query: AuditLogsQueryDto) {
    const {
      page = 1,
      limit = 50,
      userId,
      action,
      entityType,
      entityId,
      startDate,
      endDate,
      search,
    } = query;

    const where: any = {};

    // User filter
    if (userId) {
      where.userId = userId;
    }

    // Action filter
    if (action) {
      where.action = action.toUpperCase();
    }

    // Entity type filter
    if (entityType) {
      where.entityType = entityType.toUpperCase();
    }

    // Entity ID filter
    if (entityId) {
      where.entityId = entityId;
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = this.startOfDay(startDate);
      }
      if (endDate) {
        where.createdAt.lte = this.endOfDay(endDate);
      }
    }

    // Search filter (search in action, entityType, and metadata)
    if (search) {
      // No `mode: 'insensitive'` — the datasource is SQLite, where Prisma rejects
      // that argument outright. SQLite's LIKE is already case-insensitive for ASCII.
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const pagination = getPagination(page, limit, total);

    return {
      data: items,
      pagination,
    };
  }

  async getAuditStats() {
    const [
      totalLogs,
      logsToday,
      logsThisWeek,
      topActions,
      topEntities,
      topUsers,
      recentActivity,
    ] = await Promise.all([
      this.prisma.auditLog.count(),
      this.getLogsCountSince('day'),
      this.getLogsCountSince('week'),
      this.getTopActions(),
      this.getTopEntities(),
      this.getTopUsers(),
      this.getRecentActivity(),
    ]);

    return {
      totalLogs,
      logsToday,
      logsThisWeek,
      topActions,
      topEntities,
      topUsers,
      recentActivity,
    };
  }

  async exportAuditLogs(query: AuditLogsQueryDto) {
    // Get all logs matching the query (no pagination for export)
    const { userId, action, entityType, entityId, startDate, endDate, search } = query;

    const where: any = {};

    if (userId) where.userId = userId;
    if (action) where.action = action.toUpperCase();
    if (entityType) where.entityType = entityType.toUpperCase();
    if (entityId) where.entityId = entityId;
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = this.startOfDay(startDate);
      if (endDate) where.createdAt.lte = this.endOfDay(endDate);
    }

    if (search) {
      // No `mode: 'insensitive'` — the datasource is SQLite, where Prisma rejects
      // that argument outright. SQLite's LIKE is already case-insensitive for ASCII.
      where.OR = [
        { action: { contains: search } },
        { entityType: { contains: search } },
        { entityId: { contains: search } },
        { user: { name: { contains: search } } },
        { user: { email: { contains: search } } },
      ];
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });

    // Convert to CSV format
    const headers = [
      'ID',
      'User Name',
      'User Email',
      'User Role',
      'Action',
      'Entity Type',
      'Entity ID',
      'IP Address',
      'User Agent',
      'Created At',
      'Changes',
      'Metadata',
    ];

    const rows = [
      headers,
      ...logs.map((log) => [
        log.id,
        log.user?.name || 'Unknown',
        log.user?.email || 'Unknown',
        log.user?.role || 'UNKNOWN',
        log.action,
        log.entityType,
        log.entityId || '',
        log.ipAddress || '',
        log.userAgent || '',
        log.createdAt.toISOString(),
        JSON.stringify(log.changes || {}),
        JSON.stringify(log.metadata || {}),
      ]),
    ];

    // `;` plus a UTF-8 BOM so Excel in a Greek locale opens the file with real
    // columns and intact accents. Every field is escaped — a user name or
    // user-agent containing a quote used to break the row apart.
    const data =
      '﻿' +
      rows
        .map((row) =>
          row
            .map((cell) => {
              const value = String(cell ?? '');
              return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
            })
            .join(';'),
        )
        .join('\r\n');

    return {
      filename: `audit-logs-${new Date().toISOString().split('T')[0]}.csv`,
      data,
    };
  }

  private async getLogsCountSince(period: 'day' | 'week'): Promise<number> {
    const now = new Date();
    let startDate: Date;

    if (period === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return this.prisma.auditLog.count({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
    });
  }

  private async getTopActions(): Promise<Array<{ action: string; count: number }>> {
    const result = await this.prisma.auditLog.groupBy({
      by: ['action'],
      _count: {
        action: true,
      },
      orderBy: {
        _count: {
          action: 'desc',
        },
      },
      take: 10,
    });

    return result.map((item) => ({
      action: item.action,
      count: item._count.action,
    }));
  }

  private async getTopEntities(): Promise<Array<{ entityType: string; count: number }>> {
    const result = await this.prisma.auditLog.groupBy({
      by: ['entityType'],
      _count: {
        entityType: true,
      },
      orderBy: {
        _count: {
          entityType: 'desc',
        },
      },
      take: 10,
    });

    return result.map((item) => ({
      entityType: item.entityType,
      count: item._count.entityType,
    }));
  }

  private async getTopUsers(): Promise<Array<{ user: { name: string; email: string }; count: number }>> {
    const result = await this.prisma.auditLog.groupBy({
      by: ['userId'],
      _count: { userId: true },
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    if (result.length === 0) return [];

    const userMap = await this.prisma.user
      .findMany({
        where: { id: { in: result.map((r) => r.userId) } },
        select: { id: true, name: true, email: true },
      })
      .then((users) => new Map(users.map((u) => [u.id, u])));

    return result.map((item) => {
      const user = userMap.get(item.userId);
      return {
        user: { name: user?.name || 'Unknown', email: user?.email || 'Unknown' },
        count: item._count.userId,
      };
    });
  }

  private async getRecentActivity(): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}
