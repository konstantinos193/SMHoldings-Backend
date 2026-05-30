import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { computeNightlySubtotal } from '../common/utils/price.util';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(createRoomDto: CreateRoomDto, userId: string) {
    // Verify property exists and belongs to user
    const property = await this.prisma.property.findUnique({
      where: { id: createRoomDto.propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (property.ownerId !== userId) {
      throw new ForbiddenException('You can only add rooms to your own properties');
    }

    // Create room
    const room = await this.prisma.room.create({
      data: {
        ...createRoomDto,
        ownerId: userId,
        amenities: createRoomDto.amenities || [],
        images: createRoomDto.images || [],
      },
    });

    // Update property to indicate it has dynamic rooms
    await this.prisma.property.update({
      where: { id: createRoomDto.propertyId },
      data: { hasDynamicRooms: true },
    });

    return room;
  }

  async findAll(propertyId: string, userId?: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    // Only property owner can see all rooms (including non-bookable)
    const where: any = { propertyId };
    if (property.ownerId !== userId) {
      where.isBookable = true; // Guests only see bookable rooms
    }

    const rooms = await this.prisma.room.findMany({
      where,
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: { rooms },
    };
  }

  async getMinPrice(): Promise<{ minPrice: number | null }> {
    const result = await this.prisma.room.aggregate({
      where: {
        isBookable: true,
        property: { status: 'ACTIVE' },
      },
      _min: { basePrice: true },
    });
    return { minPrice: result._min.basePrice };
  }

  async findAllBookable() {
    const rooms = await this.prisma.room.findMany({
      where: { isBookable: true },
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
          },
        },
      },
      orderBy: [{ property: { titleGr: 'asc' } }, { name: 'asc' }],
    });

    return {
      success: true,
      data: { rooms },
    };
  }

  async findAllPublic() {
    // Return all rooms (including non-bookable) so they appear in the listing
    // Non-bookable rooms (e.g. apartment 10) show as "not available to book"
    // Rooms with inactive properties are automatically marked as non-bookable
    const rooms = await this.prisma.room.findMany({
      select: {
        id: true,
        propertyId: true,
        name: true,
        nameGr: true,
        nameEn: true,
        nameIt: true,
        type: true,
        capacity: true,
        maxAdults: true,
        maxChildren: true,
        maxInfants: true,
        basePrice: true,
        isBookable: true,
        amenities: true,
        images: true,
        descriptionGr: true,
        descriptionEn: true,
        descriptionIt: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
            address: true,
            city: true,
            images: true,
            status: true, // Include property status to check if it's active
            amenities: {
              include: {
                amenity: {
                  select: {
                    id: true,
                    nameGr: true,
                    nameEn: true,
                    nameIt: true,
                    icon: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Automatically mark rooms as non-bookable if their property is inactive
    return rooms.map(room => ({
      ...room,
      isBookable: room.isBookable && room.property.status === 'ACTIVE',
    }));
  }

  async findAvailablePublic(checkIn: string, checkOut: string, guests?: number, adults?: number, children?: number) {
    const { startDate, endDate } = this.parseSearchDates(checkIn, checkOut);

    const roomWhere: any = { isBookable: true };

    if (adults !== undefined && Number.isFinite(adults)) {
      const childrenCount = (children !== undefined && Number.isFinite(children)) ? Math.floor(children) : 0;
      roomWhere.AND = roomWhere.AND || [];

      // Filter by adults: if maxAdults is set use it, otherwise fall back to total capacity
      roomWhere.AND.push({
        OR: [
          { maxAdults: { gte: Math.floor(adults) } },
          { maxAdults: null, capacity: { gte: Math.floor(adults) + childrenCount } },
        ],
      });

      // Filter by children: if maxChildren is set it must accommodate them
      if (childrenCount > 0) {
        roomWhere.AND.push({
          OR: [
            { maxChildren: { gte: childrenCount } },
            { maxChildren: null },
          ],
        });
      }
    } else if (guests !== undefined) {
      if (!Number.isFinite(guests) || guests < 1) {
        throw new BadRequestException('Guests must be a positive number');
      }
      roomWhere.capacity = { gte: Math.floor(guests) };
    }

    const rooms = await this.prisma.room.findMany({
      where: roomWhere,
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
            address: true,
            city: true,
            images: true,
            status: true, // Include property status to check if it's active
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Filter out rooms from inactive properties
    const activePropertyRooms = rooms.filter(room => room.property.status === 'ACTIVE');

    const propertyIds = [...new Set(activePropertyRooms.map((r) => r.propertyId))];
    const roomIds = activePropertyRooms.map((r) => r.id);

    const [blockedRecords, conflictingBookings, closedRules] = await Promise.all([
      this.prisma.propertyAvailability.findMany({
        where: {
          propertyId: { in: propertyIds },
          date: { gte: startDate, lte: endDate },
          available: false,
        },
        select: { propertyId: true },
      }),
      this.prisma.booking.findMany({
        where: {
          roomId: { in: roomIds },
          status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
          checkIn: { lt: endDate },
          checkOut: { gt: startDate },
        },
        select: { roomId: true },
      }),
      this.prisma.roomAvailabilityRule.findMany({
        where: {
          roomId: { in: roomIds },
          isAvailable: false,
          startDate: { lte: endDate },
          endDate: { gte: startDate },
        },
        select: { roomId: true },
      }),
    ]);

    const blockedPropertyIds = new Set(blockedRecords.map((r) => r.propertyId));
    const bookedRoomIds = new Set(conflictingBookings.map((b) => b.roomId).filter(Boolean));
    const closedRoomIds = new Set(closedRules.map((r) => r.roomId));

    const availableRooms = activePropertyRooms.filter(
      (room) =>
        !blockedPropertyIds.has(room.propertyId) &&
        !bookedRoomIds.has(room.id) &&
        !closedRoomIds.has(room.id),
    );

    // Fetch price override rules for available rooms in the date range
    const availableRoomIds = availableRooms.map((r) => r.id);
    const priceRules = await this.prisma.roomAvailabilityRule.findMany({
      where: {
        roomId: { in: availableRoomIds },
        isAvailable: true,
        priceOverride: { not: null },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { roomId: true, startDate: true, endDate: true, priceOverride: true },
    });

    return availableRooms.map((room) => {
      const roomRules = priceRules.filter((r) => r.roomId === room.id);
      if (roomRules.length === 0) {
        return { ...room, effectivePrice: room.basePrice };
      }
      const { subtotal, nights } = computeNightlySubtotal(room.basePrice, roomRules, startDate, endDate);
      if (nights === 0) return { ...room, effectivePrice: room.basePrice };
      return { ...room, effectivePrice: Math.round((subtotal / nights) * 100) / 100 };
    });
  }

  async findOnePublic(id: string) {
    const room = await this.prisma.room.findUnique({
      where: { id }, // Remove isBookable filter to show all rooms
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
            address: true,
            city: true,
            images: true,
            status: true, // Include property status to check if it's active
            amenities: {
              include: {
                amenity: {
                  select: {
                    id: true,
                    nameGr: true,
                    nameEn: true,
                    nameIt: true,
                    icon: true,
                    category: true,
                  },
                },
              },
            },
          },
        },
        availabilityRules: {
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found or not available');
    }

    // Automatically mark room as non-bookable if property is inactive
    return {
      ...room,
      isBookable: room.isBookable && room.property.status === 'ACTIVE',
    };
  }

  async findOne(id: string, userId?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Verify access
    if (!room.isBookable && room.ownerId !== userId) {
      throw new ForbiddenException('Room is not available for booking');
    }

    return room;
  }

  async update(id: string, updateRoomDto: UpdateRoomDto, userId: string, userRole?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Admin users can update any room
    if (userRole !== 'ADMIN' && room.ownerId !== userId) {
      throw new ForbiddenException('You can only update your own rooms');
    }

    return this.prisma.room.update({
      where: { id },
      data: updateRoomDto,
    });
  }

  async remove(id: string, userId: string, userRole?: string) {
    const room = await this.prisma.room.findUnique({
      where: { id },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Admin users can delete any room
    if (userRole !== 'ADMIN' && room.ownerId !== userId) {
      throw new ForbiddenException('You can only delete your own rooms');
    }

    await this.prisma.room.delete({
      where: { id },
    });

    // Check if property still has rooms
    const remainingRooms = await this.prisma.room.count({
      where: { propertyId: room.propertyId },
    });

    if (remainingRooms === 0) {
      await this.prisma.property.update({
        where: { id: room.propertyId },
        data: { hasDynamicRooms: false },
      });
    }

    return { message: 'Room deleted successfully' };
  }

  async getRoomAvailability(roomId: string, startDate: Date, endDate: Date) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: { property: true },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    return this.calculatePropertyAvailability(room.propertyId, startDate, endDate);
  }

  // Pricing Rules CRUD
  async getPricingRules(roomId: string) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    const rules = await this.prisma.roomAvailabilityRule.findMany({
      where: { roomId },
      orderBy: { startDate: 'asc' },
    });
    return { success: true, data: rules };
  }

  async createPricingRule(roomId: string, dto: CreatePricingRuleDto) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    const rule = await this.prisma.roomAvailabilityRule.create({
      data: {
        roomId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        priceOverride: dto.priceOverride ?? null,
        isAvailable: dto.isAvailable ?? true,
        reason: dto.reason ?? null,
        minStayOverride: dto.minStayOverride ?? null,
      },
    });
    return { success: true, data: rule };
  }

  async updatePricingRule(roomId: string, ruleId: string, dto: UpdatePricingRuleDto) {
    const rule = await this.prisma.roomAvailabilityRule.findFirst({
      where: { id: ruleId, roomId },
    });
    if (!rule) throw new NotFoundException('Pricing rule not found');

    const updated = await this.prisma.roomAvailabilityRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        ...(dto.priceOverride !== undefined && { priceOverride: dto.priceOverride }),
        ...(dto.isAvailable !== undefined && { isAvailable: dto.isAvailable }),
        ...(dto.reason !== undefined && { reason: dto.reason }),
        ...(dto.minStayOverride !== undefined && { minStayOverride: dto.minStayOverride }),
      },
    });
    return { success: true, data: updated };
  }

  async deletePricingRule(roomId: string, ruleId: string) {
    const rule = await this.prisma.roomAvailabilityRule.findFirst({
      where: { id: ruleId, roomId },
    });
    if (!rule) throw new NotFoundException('Pricing rule not found');

    await this.prisma.roomAvailabilityRule.delete({ where: { id: ruleId } });
    return { success: true };
  }

  async getAvailabilityCalendar(roomId: string, year: number, month: number) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    // month is 0-indexed from frontend (JS convention)
    const startDate = new Date(Date.UTC(year, month, 1));
    const endDate = new Date(Date.UTC(year, month + 1, 1));

    const [rules, bookings] = await Promise.all([
      this.prisma.roomAvailabilityRule.findMany({
        where: {
          roomId,
          startDate: { lt: endDate },
          endDate: { gt: startDate },
          isAvailable: false,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          roomId,
          status: { notIn: ['CANCELLED'] },
          checkIn: { lt: endDate },
          checkOut: { gt: startDate },
        },
        select: { id: true, checkIn: true, checkOut: true, guestName: true },
      }),
    ]);

    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const days: {
      date: string;
      isAvailable: boolean;
      reason?: string;
      bookingId?: string;
      guestName?: string;
    }[] = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dayUtc = new Date(Date.UTC(year, month, d));
      const dateStr = dayUtc.toISOString().slice(0, 10);

      const blockedRule = rules.find(
        (r) => new Date(r.startDate) <= dayUtc && new Date(r.endDate) > dayUtc,
      );

      const booking = bookings.find(
        (b) => new Date(b.checkIn) <= dayUtc && new Date(b.checkOut) > dayUtc,
      );

      days.push({
        date: dateStr,
        isAvailable: !blockedRule,
        ...(blockedRule?.reason ? { reason: blockedRule.reason } : {}),
        ...(booking ? { bookingId: booking.id, guestName: booking.guestName } : {}),
      });
    }

    return { success: true, data: days };
  }

  async updateAvailability(
    roomId: string,
    dto: { isAvailable: boolean; startDate: string; endDate: string; reason?: string },
  ) {
    const room = await this.prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new NotFoundException('Room not found');

    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    // endDate from frontend is inclusive (single day: startDate === endDate),
    // but our rule endDate is exclusive — advance by 1 day.
    end.setUTCDate(end.getUTCDate() + 1);

    if (dto.isAvailable) {
      // Remove any blocking rules that overlap this range
      await this.prisma.roomAvailabilityRule.deleteMany({
        where: {
          roomId,
          isAvailable: false,
          startDate: { lt: end },
          endDate: { gt: start },
        },
      });
    } else {
      // Block this range
      await this.prisma.roomAvailabilityRule.create({
        data: {
          roomId,
          startDate: start,
          endDate: end,
          isAvailable: false,
          reason: dto.reason ?? null,
        },
      });
    }

    return { success: true };
  }

  async calculateRoomNightlySubtotal(roomId: string, checkIn: Date, checkOut: Date): Promise<{ subtotal: number; nights: number }> {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        availabilityRules: {
          where: {
            startDate: { lte: checkOut },
            endDate: { gte: checkIn },
            isAvailable: true,
          },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!room) throw new NotFoundException('Room not found');

    return computeNightlySubtotal(room.basePrice, room.availabilityRules, checkIn, checkOut);
  }

  private parseSearchDates(checkIn: string, checkOut: string) {
    if (!checkIn || !checkOut) {
      throw new BadRequestException('checkIn and checkOut are required');
    }

    const startDate = new Date(checkIn);
    const endDate = new Date(checkOut);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid checkIn or checkOut date');
    }

    if (endDate <= startDate) {
      throw new BadRequestException('checkOut must be after checkIn');
    }

    return { startDate, endDate };
  }

  async getOccupancyForRange(startDateStr: string, endDateStr: string) {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid startDate or endDate');
    }

    if (endDate < startDate) {
      throw new BadRequestException('endDate must be after startDate');
    }

    // Fetch all bookable rooms in one query
    const rooms = await this.prisma.room.findMany({
      where: { isBookable: true },
      select: { id: true, propertyId: true },
    });

    const totalRooms = rooms.length;
    if (totalRooms === 0) {
      return { dates: {}, totalRooms: 0 };
    }

    // Get unique property IDs
    const propertyIds = [...new Set(rooms.map((r) => r.propertyId))];

    // Fetch all overlapping bookings for these rooms in one query
    const roomIds = rooms.map((r) => r.id);
    const bookings = await this.prisma.booking.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
        checkIn: { lte: endDate },
        checkOut: { gte: startDate },
      },
      select: { roomId: true, checkIn: true, checkOut: true },
    });

    // Fetch explicitly blocked dates (available: false) for these properties
    const blockedRecords = await this.prisma.propertyAvailability.findMany({
      where: {
        propertyId: { in: propertyIds },
        date: { gte: startDate, lte: endDate },
        available: false,
      },
      select: { propertyId: true, date: true },
    });

    // Build a set of propertyId+date that are explicitly blocked
    const blockedSet = new Set<string>();
    for (const rec of blockedRecords) {
      const d = new Date(rec.date);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      blockedSet.add(`${rec.propertyId}:${dateStr}`);
    }

    // Build per-room booking ranges for quick lookup
    const roomBookingsMap = new Map<string, Array<{ checkIn: Date; checkOut: Date }>>();
    for (const b of bookings) {
      if (!roomBookingsMap.has(b.roomId)) {
        roomBookingsMap.set(b.roomId, []);
      }
      roomBookingsMap.get(b.roomId)!.push({
        checkIn: new Date(b.checkIn),
        checkOut: new Date(b.checkOut),
      });
    }

    // Compute per-day occupancy
    const dates: Record<string, { available: number; total: number; occupancy: number }> = {};
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);

      let availableCount = 0;

      for (const room of rooms) {
        const isBlocked = blockedSet.has(`${room.propertyId}:${dayStr}`);
        const roomBookings = roomBookingsMap.get(room.id) || [];
        const hasConflict = roomBookings.some(
          (b) => b.checkIn < nextDay && b.checkOut > currentDate,
        );

        if (!isBlocked && !hasConflict) {
          availableCount++;
        }
      }

      const occupancyRate = totalRooms > 0
        ? Math.round(((totalRooms - availableCount) / totalRooms) * 100)
        : 0;

      dates[dayStr] = {
        available: availableCount,
        total: totalRooms,
        occupancy: occupancyRate,
      };

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return { dates, totalRooms };
  }

  async getDashboardStats() {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Get all rooms (not just bookable) for full management view
    const rooms = await this.prisma.room.findMany({
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            titleIt: true,
            cleaningFee: true,
            lastCleaningDate: true,
          },
        },
      },
      orderBy: [{ isBookable: 'desc' }, { name: 'asc' }],
    });

    if (rooms.length === 0) {
      return {
        success: true,
        data: {
          stats: {
            totalRooms: 0,
            bookableRooms: 0,
            unavailableRooms: 0,
            averagePrice: 0,
            totalUpcomingBookings: 0,
            occupancyRate: 0,
            totalRevenue: 0,
          },
          rooms: [],
        },
      };
    }

    const propertyIds = [...new Set(rooms.map((r) => r.propertyId))];

    // Fetch upcoming bookings for all rooms (next 30 days)
    const upcomingBookings = await this.prisma.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
        checkOut: { gte: now },
        checkIn: { lte: thirtyDaysFromNow },
      },
      select: {
        id: true,
        propertyId: true,
        roomId: true,
        roomName: true,
        checkIn: true,
        checkOut: true,
        guestName: true,
        guests: true,
        totalPrice: true,
        status: true,
      },
      orderBy: { checkIn: 'asc' },
    });

    // Fetch all completed bookings for revenue
    const completedBookings = await this.prisma.booking.findMany({
      where: {
        propertyId: { in: propertyIds },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
      },
      select: {
        roomId: true,
        totalPrice: true,
      },
    });

    // Fetch cleaning schedules
    const cleaningSchedules = await this.prisma.cleaningSchedule.findMany({
      where: {
        propertyId: { in: propertyIds },
      },
      select: {
        propertyId: true,
        lastCleaned: true,
        nextCleaning: true,
        frequency: true,
      },
      orderBy: { lastCleaned: 'desc' },
    });

    // Build per-room data
    const bookingsByRoom = new Map<string, typeof upcomingBookings>();
    const bookingsByProperty = new Map<string, typeof upcomingBookings>();
    for (const booking of upcomingBookings) {
      const key = booking.roomId || booking.propertyId;
      if (booking.roomId) {
        if (!bookingsByRoom.has(booking.roomId)) bookingsByRoom.set(booking.roomId, []);
        bookingsByRoom.get(booking.roomId)!.push(booking);
      }
      if (!bookingsByProperty.has(booking.propertyId)) bookingsByProperty.set(booking.propertyId, []);
      bookingsByProperty.get(booking.propertyId)!.push(booking);
    }

    const revenueByRoom = new Map<string, number>();
    for (const b of completedBookings) {
      if (b.roomId) {
        revenueByRoom.set(b.roomId, (revenueByRoom.get(b.roomId) || 0) + b.totalPrice);
      }
    }

    const cleaningByProperty = new Map<string, (typeof cleaningSchedules)[0]>();
    for (const cs of cleaningSchedules) {
      if (!cleaningByProperty.has(cs.propertyId)) {
        cleaningByProperty.set(cs.propertyId, cs);
      }
    }

    // Check which rooms are currently occupied
    const activeBookings = upcomingBookings.filter(
      (b) =>
        (b.status === 'CONFIRMED' || b.status === 'CHECKED_IN') &&
        new Date(b.checkIn) <= now &&
        new Date(b.checkOut) >= now,
    );
    const occupiedRoomIds = new Set(activeBookings.map((b) => b.roomId).filter(Boolean));
    const occupiedPropertyIds = new Set(activeBookings.map((b) => b.propertyId));

    const bookableRooms = rooms.filter((r) => r.isBookable);
    const totalRevenue = Array.from(revenueByRoom.values()).reduce((sum, v) => sum + v, 0);
    const avgPrice = bookableRooms.length > 0
      ? bookableRooms.reduce((sum, r) => sum + r.basePrice, 0) / bookableRooms.length
      : 0;

    const occupiedCount = bookableRooms.filter(
      (r) => occupiedRoomIds.has(r.id) || occupiedPropertyIds.has(r.propertyId),
    ).length;
    const occupancyRate = bookableRooms.length > 0
      ? Math.round((occupiedCount / bookableRooms.length) * 100)
      : 0;

    const enrichedRooms = rooms.map((room) => {
      const roomBookings = bookingsByRoom.get(room.id) || bookingsByProperty.get(room.propertyId) || [];
      const cleaning = cleaningByProperty.get(room.propertyId);
      const isOccupied = occupiedRoomIds.has(room.id) || occupiedPropertyIds.has(room.propertyId);
      const nextBooking = roomBookings.find((b) => new Date(b.checkIn) > now);
      const revenue = revenueByRoom.get(room.id) || 0;

      return {
        ...room,
        upcomingBookingsCount: roomBookings.length,
        nextBooking: nextBooking
          ? {
              id: nextBooking.id,
              checkIn: nextBooking.checkIn,
              checkOut: nextBooking.checkOut,
              guestName: nextBooking.guestName,
              guests: nextBooking.guests,
            }
          : null,
        isOccupied,
        lastCleaned: cleaning?.lastCleaned || null,
        nextCleaning: cleaning?.nextCleaning || null,
        cleaningFrequency: cleaning?.frequency || null,
        totalRevenue: revenue,
      };
    });

    return {
      success: true,
      data: {
        stats: {
          totalRooms: rooms.length,
          bookableRooms: bookableRooms.length,
          unavailableRooms: rooms.length - bookableRooms.length,
          averagePrice: Math.round(avgPrice * 100) / 100,
          totalUpcomingBookings: upcomingBookings.length,
          occupancyRate,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
        },
        rooms: enrichedRooms,
      },
    };
  }

  private async calculatePropertyAvailability(propertyId: string, startDate: Date, endDate: Date) {
    const [blockedRecords, bookings] = await Promise.all([
      this.prisma.propertyAvailability.findMany({
        where: {
          propertyId,
          date: {
            gte: startDate,
            lte: endDate,
          },
          available: false,
        },
      }),
      this.prisma.booking.findMany({
        where: {
          propertyId,
          status: {
            in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'],
          },
          OR: [
            {
              checkIn: { lt: endDate },
              checkOut: { gt: startDate },
            },
          ],
        },
      }),
    ]);

    return {
      available: blockedRecords.length === 0 && bookings.length === 0,
      availability: blockedRecords,
      conflictingBookings: bookings.length,
    };
  }
}

