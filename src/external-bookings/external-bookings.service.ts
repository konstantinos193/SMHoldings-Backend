import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExternalBookingDto } from './dto/create-external-booking.dto';
import { UpdateExternalBookingDto } from './dto/update-external-booking.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { getPagination } from '../common/utils/pagination.util';

@Injectable()
export class ExternalBookingsService {
  private readonly logger = new Logger(ExternalBookingsService.name);

  // Default commission rates per platform (can be overridden per booking)
  private readonly DEFAULT_COMMISSION_RATES: Record<string, number> = {
    BOOKING_COM: 15,
    AIRBNB: 3,     // Airbnb host-only fee model
    VRBO: 8,
    EXPEDIA: 15,
    MANUAL: 0,
    OTHER: 0,
  };

  constructor(private prisma: PrismaService) {}

  /**
   * Import a booking from an external platform (Booking.com, Airbnb, etc.)
   * This is the main entry point for third-party booking sync.
   */
  async importBooking(dto: CreateExternalBookingDto) {
    // Check if this external booking was already imported (idempotent)
    const existing = await this.prisma.booking.findFirst({
      where: {
        source: dto.source as any,
        externalId: dto.externalId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Booking from ${dto.source} with external ID "${dto.externalId}" already exists (internal ID: ${existing.id})`,
      );
    }

    // Validate property exists
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: { id: true, status: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);

    // Check for date conflicts with existing bookings (both direct and external)
    const conflictingBookings = await this.prisma.booking.findMany({
      where: {
        propertyId: dto.propertyId,
        status: { in: ['CONFIRMED', 'CHECKED_IN'] },
        OR: [
          {
            checkIn: { lte: checkOut },
            checkOut: { gte: checkIn },
          },
        ],
      },
    });

    if (conflictingBookings.length > 0) {
      const conflictIds = conflictingBookings.map((b) => b.id).join(', ');
      throw new BadRequestException(
        `Date conflict with existing booking(s): ${conflictIds}`,
      );
    }

    // Resolve commission
    const commissionRate = dto.commissionRate ?? this.DEFAULT_COMMISSION_RATES[dto.source] ?? 0;
    const commissionAmount = dto.commissionAmount ?? (dto.totalPrice * commissionRate) / 100;
    const netRevenue = dto.totalPrice - commissionAmount;

    // Create or find a guest user for the external guest
    let guest = await this.prisma.user.findFirst({
      where: { email: dto.guestEmail },
    });

    if (!guest) {
      guest = await this.prisma.user.create({
        data: {
          email: dto.guestEmail,
          name: dto.guestName,
          phone: dto.guestPhone,
          role: 'USER',
          isActive: true,
        },
      });
    }

    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24),
    );

    const booking = await this.prisma.booking.create({
      data: {
        propertyId: dto.propertyId,
        guestId: guest.id,
        status: 'CONFIRMED', // External bookings are typically already confirmed
        checkIn,
        checkOut,
        guests: dto.guests,
        totalPrice: dto.totalPrice,
        basePrice: dto.basePrice ?? dto.totalPrice,
        cleaningFee: dto.cleaningFee,
        currency: dto.currency ?? 'EUR',

        // Third-party fields
        source: dto.source as any,
        externalId: dto.externalId,
        externalPlatform: dto.externalPlatform,
        externalData: dto.externalData ?? {},
        commissionRate,
        commissionAmount,
        netRevenue,
        externalGuestId: dto.externalGuestId,
        iCalUid: dto.iCalUid,
        lastSyncedAt: new Date(),

        // Guest info
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone,
        specialRequests: dto.specialRequests,
      },
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            address: true,
            city: true,
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
    });

    this.logger.log(
      `Imported ${dto.source} booking "${dto.externalId}" → internal ID: ${booking.id}`,
    );

    return {
      success: true,
      message: `External booking imported successfully from ${dto.source}`,
      data: booking,
    };
  }

  /**
   * Sync / update an existing external booking (e.g. date change, cancellation from platform)
   */
  async syncBooking(id: string, dto: UpdateExternalBookingDto) {
    const existing = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Booking not found');
    }

    if (existing.source === 'DIRECT') {
      throw new BadRequestException('Cannot sync a direct booking — use the regular update endpoint');
    }

    // Recalculate commission if price or rate changed
    const updateData: any = { ...dto, lastSyncedAt: new Date() };

    if (dto.checkIn) updateData.checkIn = new Date(dto.checkIn);
    if (dto.checkOut) updateData.checkOut = new Date(dto.checkOut);

    if (dto.totalPrice !== undefined || dto.commissionRate !== undefined) {
      const totalPrice = dto.totalPrice ?? existing.totalPrice;
      const commissionRate = dto.commissionRate ?? existing.commissionRate ?? 0;
      const commissionAmount = dto.commissionAmount ?? (totalPrice * commissionRate) / 100;
      updateData.commissionAmount = commissionAmount;
      updateData.netRevenue = totalPrice - commissionAmount;
    }

    // Remove raw DTO fields that don't map directly
    delete updateData.externalData;
    if (dto.externalData) {
      updateData.externalData = dto.externalData;
    }

    const booking = await this.prisma.booking.update({
      where: { id },
      data: updateData,
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            address: true,
            city: true,
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
    });

    this.logger.log(`Synced external booking ${id} (${existing.source})`);

    return {
      success: true,
      message: 'External booking synced successfully',
      data: booking,
    };
  }

  /**
   * Find a booking by its external platform ID
   */
  async findByExternalId(source: string, externalId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: {
        source: source.toUpperCase() as any,
        externalId,
      },
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            address: true,
            city: true,
          },
        },
        guest: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException(
        `No booking found from ${source} with external ID "${externalId}"`,
      );
    }

    return {
      success: true,
      data: booking,
    };
  }

  /**
   * List all external bookings, optionally filtered by source
   */
  async findAllExternal(query: PaginationDto & { source?: string }) {
    const { page = 1, limit = 10, sortBy, sortOrder = 'desc', source } = query;
    const skip = (page - 1) * limit;

    const orderBy: any = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    const where: any = {
      source: { not: 'DIRECT' },
    };

    if (source) {
      where.source = source;
    }

    const [bookings, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        include: {
          property: {
            select: {
              id: true,
              titleGr: true,
              titleEn: true,
              address: true,
              city: true,
            },
          },
          guest: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.booking.count({ where }),
    ]);

    const pagination = getPagination(page, limit, total);

    return {
      success: true,
      data: {
        bookings,
        pagination,
      },
    };
  }

  /**
   * Get revenue summary broken down by booking source
   */
  async getRevenueBySource() {
    const bookings = await this.prisma.booking.findMany({
      where: {
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
      },
      select: {
        source: true,
        totalPrice: true,
        commissionAmount: true,
        netRevenue: true,
        currency: true,
      },
    });

    const summary: Record<string, {
      totalBookings: number;
      totalRevenue: number;
      totalCommission: number;
      netRevenue: number;
      currency: string;
    }> = {};

    for (const b of bookings) {
      const src = b.source ?? 'DIRECT';
      if (!summary[src]) {
        summary[src] = {
          totalBookings: 0,
          totalRevenue: 0,
          totalCommission: 0,
          netRevenue: 0,
          currency: b.currency,
        };
      }
      summary[src].totalBookings += 1;
      summary[src].totalRevenue += b.totalPrice;
      summary[src].totalCommission += b.commissionAmount ?? 0;
      summary[src].netRevenue += b.netRevenue ?? b.totalPrice;
    }

    // Round values
    for (const key of Object.keys(summary)) {
      summary[key].totalRevenue = Math.round(summary[key].totalRevenue * 100) / 100;
      summary[key].totalCommission = Math.round(summary[key].totalCommission * 100) / 100;
      summary[key].netRevenue = Math.round(summary[key].netRevenue * 100) / 100;
    }

    return {
      success: true,
      data: summary,
    };
  }

  /**
   * Bulk import multiple external bookings (e.g. initial sync from a platform)
   */
  async bulkImport(bookings: CreateExternalBookingDto[]) {
    if (!Array.isArray(bookings) || bookings.length === 0) {
      throw new BadRequestException('Request body must be a non-empty array of bookings');
    }

    const results: { success: boolean; externalId: string; internalId?: string; error?: string }[] = [];

    for (const dto of bookings) {
      try {
        const result = await this.importBooking(dto);
        results.push({
          success: true,
          externalId: dto.externalId,
          internalId: result.data.id,
        });
      } catch (error: any) {
        results.push({
          success: false,
          externalId: dto.externalId,
          error: error.message,
        });
      }
    }

    const imported = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    this.logger.log(`Bulk import complete: ${imported} imported, ${failed} failed`);

    return {
      success: true,
      message: `Bulk import: ${imported} imported, ${failed} failed`,
      data: {
        total: bookings.length,
        imported,
        failed,
        results,
      },
    };
  }
}
