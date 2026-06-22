import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    this.logger.log(`Fetching notifications for user ${userId}, page ${page}, limit ${limit}`);
    const startTime = Date.now();

    try {
      const [notifications, total, unreadCount] = await Promise.all([
        this.prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.notification.count({ where: { userId } }),
        this.prisma.notification.count({ where: { userId, isRead: false } }),
      ]);

      const duration = Date.now() - startTime;
      this.logger.log(`Notifications fetched successfully in ${duration}ms`);

      return {
        success: true,
        data: {
          notifications,
          unreadCount,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to fetch notifications after ${duration}ms`, error);
      throw error;
    }
  }

  async getUnreadCount(userId: string) {
    this.logger.log(`Fetching unread count for user ${userId}`);
    const startTime = Date.now();

    try {
      const count = await this.prisma.notification.count({
        where: { userId, isRead: false },
      });

      const duration = Date.now() - startTime;
      this.logger.log(`Unread count fetched successfully in ${duration}ms: ${count}`);

      return { success: true, data: { unreadCount: count } };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Failed to fetch unread count after ${duration}ms`, error);
      throw error;
    }
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return { success: true, data: updated };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { success: true, message: 'All notifications marked as read' };
  }

  async delete(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({ where: { id } });

    return { success: true, message: 'Notification deleted' };
  }

  async deleteAll(userId: string) {
    await this.prisma.notification.deleteMany({
      where: { userId },
    });

    return { success: true, message: 'All notifications deleted' };
  }
}
