import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCleaningScheduleDto } from './dto/create-cleaning-schedule.dto';
import { CleaningFrequency } from '../../prisma/generated/prisma';

@Injectable()
export class CleaningService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    params: { page: number; limit: number; propertyId?: string; frequency?: string; search?: string },
    userId: string,
    userRole?: string,
  ) {
    const { page, limit, propertyId, frequency, search } = params;
    const skip = (page - 1) * limit;

    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';

    const where: any = {};
    if (!isAdmin) where.ownerId = userId;
    if (propertyId) where.propertyId = propertyId;
    if (frequency) where.frequency = frequency;
    if (search) {
      where.property = { OR: [{ titleGr: { contains: search } }, { titleEn: { contains: search } }] };
    }

    const [schedules, total] = await Promise.all([
      this.prisma.cleaningSchedule.findMany({
        where,
        skip,
        take: limit,
        orderBy: { nextCleaning: 'asc' },
        include: {
          property: { select: { id: true, titleGr: true, titleEn: true, address: true, city: true, status: true } },
        },
      }),
      this.prisma.cleaningSchedule.count({ where }),
    ]);

    const now = new Date();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const soonCutoff = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const schedulesWithStatus = schedules.map((s) => {
      let computedStatus: string;
      if (!s.nextCleaning) {
        computedStatus = 'SCHEDULED';
      } else if (s.nextCleaning < now) {
        computedStatus = 'OVERDUE';
      } else if (s.nextCleaning <= todayEnd) {
        computedStatus = 'DUE_TODAY';
      } else if (s.nextCleaning <= soonCutoff) {
        computedStatus = 'UPCOMING';
      } else {
        computedStatus = 'SCHEDULED';
      }
      return { ...s, computedStatus };
    });

    const totalPages = Math.ceil(total / limit);
    return {
      success: true,
      data: {
        schedules: schedulesWithStatus,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      },
    };
  }

  async findOne(id: string) {
    const schedule = await this.prisma.cleaningSchedule.findUnique({
      where: { id },
      include: {
        property: { select: { id: true, titleGr: true, titleEn: true, address: true, city: true, status: true } },
      },
    });
    if (!schedule) throw new NotFoundException('Cleaning schedule not found');
    return { success: true, data: schedule };
  }

  async updateSchedule(id: string, updateDto: Partial<CreateCleaningScheduleDto>, userId: string, userRole?: string) {
    const schedule = await this.prisma.cleaningSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('Cleaning schedule not found');

    if (userRole !== 'ADMIN' && userRole !== 'MANAGER' && schedule.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to update cleaning schedule');
    }

    const updated = await this.prisma.cleaningSchedule.update({
      where: { id },
      data: {
        ...(updateDto.frequency && { frequency: updateDto.frequency }),
        ...(updateDto.assignedCleaner !== undefined && { assignedCleaner: updateDto.assignedCleaner }),
        ...(updateDto.notes !== undefined && { notes: updateDto.notes }),
        ...(updateDto.nextCleaning && { nextCleaning: new Date(updateDto.nextCleaning) }),
        ...(updateDto.lastCleaned && { lastCleaned: new Date(updateDto.lastCleaned) }),
      },
      include: {
        property: { select: { id: true, titleGr: true, titleEn: true, address: true, city: true, status: true } },
      },
    });
    return { success: true, data: updated };
  }

  async removeSchedule(id: string, userId: string, userRole?: string) {
    const schedule = await this.prisma.cleaningSchedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('Cleaning schedule not found');

    if (userRole !== 'ADMIN' && userRole !== 'MANAGER' && schedule.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to delete cleaning schedule');
    }

    await this.prisma.cleaningSchedule.delete({ where: { id } });
    return { success: true, message: 'Cleaning schedule deleted successfully' };
  }

  async getStats(userId: string, userRole?: string) {
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    const where: any = isAdmin ? {} : { ownerId: userId };
    const reviewWhere: any = {
      cleanlinessRating: { not: null },
      ...(isAdmin ? {} : { property: { ownerId: userId } }),
    };

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86400000);
    const weekStart = new Date(todayStart.getTime() - 6 * 86400000);

    const [totalSchedules, pendingToday, completedThisWeek, overdue, propertiesWithCleaning, avgResult] = await Promise.all([
      this.prisma.cleaningSchedule.count({ where }),
      this.prisma.cleaningSchedule.count({ where: { ...where, nextCleaning: { gte: todayStart, lt: todayEnd } } }),
      this.prisma.cleaningSchedule.count({ where: { ...where, lastCleaned: { gte: weekStart, lt: todayEnd } } }),
      this.prisma.cleaningSchedule.count({ where: { ...where, nextCleaning: { lt: now } } }),
      this.prisma.cleaningSchedule.groupBy({ by: ['propertyId'], where }).then((r) => r.length),
      this.prisma.review.aggregate({ _avg: { cleanlinessRating: true }, where: reviewWhere }),
    ]);

    const avg = avgResult._avg.cleanlinessRating;

    return {
      success: true,
      data: {
        totalSchedules,
        pendingToday,
        completedThisWeek,
        overdue,
        averageCleanlinessRating: avg ? Math.round(avg * 100) / 100 : null,
        propertiesWithCleaning,
      },
    };
  }

  async createSchedule(
    createScheduleDto: CreateCleaningScheduleDto,
    userId: string,
    userRole?: string,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { id: createScheduleDto.propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    if (!isAdmin && property.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to create cleaning schedule');
    }

    // Calculate next cleaning based on frequency
    let nextCleaning = createScheduleDto.nextCleaning
      ? new Date(createScheduleDto.nextCleaning)
      : this.calculateNextCleaning(
          createScheduleDto.frequency,
          createScheduleDto.lastCleaned
            ? new Date(createScheduleDto.lastCleaned)
            : new Date(),
        );

    return this.prisma.cleaningSchedule.create({
      data: {
        ...createScheduleDto,
        ownerId: userId,
        lastCleaned: createScheduleDto.lastCleaned
          ? new Date(createScheduleDto.lastCleaned)
          : null,
        nextCleaning,
      },
      include: { property: true },
    });
  }

  async updateCleaningDate(
    scheduleId: string,
    cleanedDate: Date,
    userId: string,
    userRole?: string,
  ) {
    const schedule = await this.prisma.cleaningSchedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Cleaning schedule not found');
    }

    if (userRole !== 'ADMIN' && userRole !== 'MANAGER' && schedule.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to update cleaning schedule');
    }

    const nextCleaning = this.calculateNextCleaning(schedule.frequency, cleanedDate);

    const [, updated] = await Promise.all([
      this.prisma.property.update({
        where: { id: schedule.propertyId },
        data: { lastCleaningDate: cleanedDate },
      }),
      this.prisma.cleaningSchedule.update({
        where: { id: scheduleId },
        data: { lastCleaned: cleanedDate, nextCleaning },
      }),
    ]);

    return updated;
  }

  async getPropertyCleanliness(propertyId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      include: {
        reviews: {
          where: { cleanlinessRating: { not: null } },
          select: {
            cleanlinessRating: true,
            createdAt: true,
          },
        },
        cleaningSchedules: {
          orderBy: { lastCleaned: 'desc' },
          take: 1,
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const cleanlinessRatings = property.reviews
      .map((r) => r.cleanlinessRating)
      .filter((r) => r !== null) as number[];

    const averageCleanliness =
      cleanlinessRatings.length > 0
        ? cleanlinessRatings.reduce((sum, r) => sum + r, 0) /
          cleanlinessRatings.length
        : null;

    return {
      propertyId: property.id,
      averageCleanlinessRating: averageCleanliness
        ? Math.round(averageCleanliness * 100) / 100
        : null,
      totalRatings: cleanlinessRatings.length,
      lastCleaningDate: property.lastCleaningDate,
      nextCleaningDate:
        property.cleaningSchedules[0]?.nextCleaning || null,
      schedule: property.cleaningSchedules[0] || null,
    };
  }

  async getSchedulesByProperty(propertyId: string, userId: string, userRole?: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    if (!isAdmin && property.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to view cleaning schedules');
    }

    return this.prisma.cleaningSchedule.findMany({
      where: { propertyId },
      orderBy: { nextCleaning: 'asc' },
    });
  }

  private calculateNextCleaning(
    frequency: CleaningFrequency,
    lastCleaned: Date,
  ): Date {
    const next = new Date(lastCleaned);

    switch (frequency) {
      case CleaningFrequency.AFTER_EACH_BOOKING:
        // Will be set when booking completes
        next.setDate(next.getDate() + 1);
        break;
      case CleaningFrequency.DAILY:
        next.setDate(next.getDate() + 1);
        break;
      case CleaningFrequency.WEEKLY:
        next.setDate(next.getDate() + 7);
        break;
      case CleaningFrequency.BIWEEKLY:
        next.setDate(next.getDate() + 14);
        break;
      case CleaningFrequency.MONTHLY:
        next.setMonth(next.getMonth() + 1);
        break;
      default:
        next.setDate(next.getDate() + 7);
    }

    return next;
  }
}

