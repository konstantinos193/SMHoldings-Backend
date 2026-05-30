import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { getPagination } from '../common/utils/pagination.util';
import { FinancialUtil } from '../common/utils/financial.util';
import { PaymentStatus } from '../database/types';
import { EmailService } from '../email/email.service';
import Stripe from 'stripe';

@Injectable()
export class BookingsService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findAll(query: BookingQueryDto) {
    const { sortBy, sortOrder = 'desc', search, status, dateFrom, dateTo, propertyId, roomId } = query;
    const page = +(query.page || 1);
    const limit = +(query.limit || 10);
    const skip = (page - 1) * limit;

    const orderBy: any = {};
    if (sortBy) {
      orderBy[sortBy] = sortOrder;
    } else {
      orderBy.createdAt = 'desc';
    }

    const where: any = {};

    if (status) where.status = status;
    if (propertyId) where.propertyId = propertyId;
    if (roomId) where.roomId = roomId;

    if (dateFrom || dateTo) {
      where.checkIn = {};
      if (dateFrom) where.checkIn.gte = new Date(dateFrom);
      if (dateTo) where.checkIn.lte = new Date(dateTo);
    }

    if (search) {
      const searchTerm = search.trim();
      where.OR = [
        { guestName: { contains: searchTerm, mode: 'insensitive' } },
        { guestEmail: { contains: searchTerm, mode: 'insensitive' } },
        { guestPhone: { contains: searchTerm, mode: 'insensitive' } },
        { id: { contains: searchTerm, mode: 'insensitive' } },
        {
          guest: {
            OR: [
              { name: { contains: searchTerm, mode: 'insensitive' } },
              { email: { contains: searchTerm, mode: 'insensitive' } },
              { phone: { contains: searchTerm, mode: 'insensitive' } },
            ],
          },
        },
        {
          property: {
            OR: [
              { titleGr: { contains: searchTerm, mode: 'insensitive' } },
              { titleEn: { contains: searchTerm, mode: 'insensitive' } },
            ],
          },
        },
      ];
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
              images: true,
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

  async exportAll() {
    const bookings = await this.prisma.booking.findMany({
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            images: true,
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
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: {
        bookings,
        total: bookings.length,
      },
    };
  }

  async findOne(id: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: {
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        guest: true,
        reviews: true,
        messages: {
          orderBy: {
            createdAt: 'asc',
          },
        },
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return {
      success: true,
      data: booking,
    };
  }

  async calculateBookingPrice(dto: {
    propertyId: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    roomId?: string;
  }): Promise<{ totalPrice: number; currency: string }> {
    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
      select: {
        id: true,
        status: true,
        basePrice: true,
        cleaningFee: true,
        serviceFeePercentage: true,
        taxRate: true,
        currency: true,
      },
    });

    if (!property) throw new NotFoundException('Property not found');
    if (property.status !== 'ACTIVE') throw new BadRequestException('Property is not available for booking');

    const checkIn = new Date(dto.checkIn);
    const checkOut = new Date(dto.checkOut);
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    let effectivePricePerNight = property.basePrice;
    if (dto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: dto.roomId },
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

      if (room) {
        let subtotal = 0;
        const current = new Date(checkIn);
        current.setHours(0, 0, 0, 0);
        const end = new Date(checkOut);
        end.setHours(0, 0, 0, 0);

        while (current < end) {
          const rule = room.availabilityRules.find(
            (r) => new Date(r.startDate) <= current && new Date(r.endDate) > current,
          );
          subtotal += rule?.priceOverride ?? room.basePrice;
          current.setDate(current.getDate() + 1);
        }

        effectivePricePerNight = nights > 0 ? subtotal / nights : room.basePrice;
      }
    }

    const priceBreakdown = FinancialUtil.calculateTotalPrice(
      effectivePricePerNight,
      nights,
      dto.guests,
      0, 0, 0, 0,
      property.currency || 'EUR',
    );

    return { totalPrice: priceBreakdown.totalPrice, currency: priceBreakdown.currency };
  }

  async createPublic(createBookingDto: CreateBookingDto) {
    // Create or find guest user
    let guest = await this.prisma.user.findFirst({
      where: { email: createBookingDto.guestEmail }
    });

    if (!guest) {
      guest = await this.prisma.user.create({
        data: {
          email: createBookingDto.guestEmail,
          name: createBookingDto.guestName,
          phone: createBookingDto.guestPhone,
          role: 'USER',
          isActive: true,
        }
      });
    }

    return this.create(createBookingDto, guest.id);
  }

  async create(createBookingDto: CreateBookingDto, guestId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: createBookingDto.propertyId },
      select: {
        id: true,
        status: true,
        basePrice: true,
        cleaningFee: true,
        serviceFeePercentage: true,
        taxRate: true,
        currency: true,
        cancellationPolicy: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (property.status !== 'ACTIVE') {
      throw new BadRequestException('Property is not available for booking');
    }

    const checkIn = new Date(createBookingDto.checkIn);
    const checkOut = new Date(createBookingDto.checkOut);

    // Room-level check: when roomId is provided, scope conflict to that room only.
    // Property-level check: when no roomId, scope to property-level (non-room) bookings.
    const conflictWhere: any = {
      status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING'] },
      OR: [{ checkIn: { lte: checkOut }, checkOut: { gte: checkIn } }],
    };

    if (createBookingDto.roomId) {
      conflictWhere.roomId = createBookingDto.roomId;
    } else {
      conflictWhere.propertyId = createBookingDto.propertyId;
      conflictWhere.roomId = null;
    }

    const conflictingBookings = await this.prisma.booking.findMany({ where: conflictWhere });

    if (conflictingBookings.length > 0) {
      const entity = createBookingDto.roomId ? 'Room' : 'Property';
      throw new BadRequestException(`${entity} is not available for the selected dates`);
    }

    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

    // When a room is specified, use room pricing rules for price calculation
    let effectivePricePerNight = property.basePrice;
    if (createBookingDto.roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: createBookingDto.roomId },
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

      if (room) {
        let subtotal = 0;
        const current = new Date(checkIn);
        current.setHours(0, 0, 0, 0);
        const end = new Date(checkOut);
        end.setHours(0, 0, 0, 0);

        while (current < end) {
          const rule = room.availabilityRules.find(
            (r) => new Date(r.startDate) <= current && new Date(r.endDate) > current,
          );
          subtotal += rule?.priceOverride ?? room.basePrice;
          current.setDate(current.getDate() + 1);
        }

        effectivePricePerNight = nights > 0 ? subtotal / nights : room.basePrice;
      }
    }

    // Calculate price breakdown using FinancialUtil (stay-only payment model)
    const priceBreakdown = FinancialUtil.calculateTotalPrice(
      effectivePricePerNight,
      nights,
      createBookingDto.guests,
      0, // No cleaning fee
      0, // No service fee
      0, // No tax
      0, // discounts
      property.currency || 'EUR',
    );

    // Calculate owner revenue (after platform fees)
    const { ownerRevenue, platformFee } = FinancialUtil.calculateOwnerRevenue(
      priceBreakdown.totalPrice,
      0, // No service fee
    );

    const booking = await this.prisma.booking.create({
      data: {
        propertyId: createBookingDto.propertyId,
        guestId,
        checkIn,
        checkOut,
        guests: createBookingDto.guests,
        totalPrice: priceBreakdown.totalPrice,
        basePrice: priceBreakdown.subtotal,
        cleaningFee: priceBreakdown.cleaningFee,
        serviceFee: priceBreakdown.serviceFee,
        taxes: priceBreakdown.taxes,
        currency: priceBreakdown.currency,
        ownerRevenue,
        platformFee,
        source: 'DIRECT',
        roomId: createBookingDto.roomId || null,
        roomName: createBookingDto.roomName || null,
        guestName: createBookingDto.guestName,
        guestEmail: createBookingDto.guestEmail,
        guestPhone: createBookingDto.guestPhone,
        specialRequests: createBookingDto.specialRequests,
      },
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            images: true,
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

    // Confirmation email is sent after payment is confirmed (in PaymentsService)

    return {
      success: true,
      message: 'Booking created successfully',
      data: booking,
    };
  }

  async update(id: string, updateBookingDto: UpdateBookingDto) {
    const existingBooking = await this.prisma.booking.findUnique({
      where: { id },
    });

    if (!existingBooking) {
      throw new NotFoundException('Booking not found');
    }

    const booking = await this.prisma.booking.update({
      where: { id },
      data: updateBookingDto,
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            images: true,
            address: true,
            city: true,
            ownerId: true,
          },
        },
        guest: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Auto-create/update cleaning task when booking is COMPLETED
    if (updateBookingDto.status === 'COMPLETED') {
      const checkoutDate = booking.checkOut;
      const existing = await this.prisma.cleaningSchedule.findFirst({
        where: { propertyId: booking.propertyId, frequency: 'AFTER_EACH_BOOKING' as any },
      });
      if (existing) {
        await this.prisma.cleaningSchedule.update({
          where: { id: existing.id },
          data: { nextCleaning: checkoutDate },
        });
      } else {
        await this.prisma.cleaningSchedule.create({
          data: {
            propertyId: booking.propertyId,
            ownerId: booking.property.ownerId,
            frequency: 'AFTER_EACH_BOOKING' as any,
            nextCleaning: checkoutDate,
            notes: `Auto-created after booking ${booking.id} checkout`,
          },
        });
      }
    }

    return {
      success: true,
      message: 'Booking updated successfully',
      data: booking,
    };
  }

  async cancel(id: string, cancelBookingDto: CancelBookingDto, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isGuest = booking.guestId === userId;
    const isOwner = booking.property.ownerId === userId;
    const isAdmin = user?.role === 'ADMIN';

    if (!isGuest && !isOwner && !isAdmin) {
      throw new BadRequestException('Unauthorized to cancel this booking');
    }

    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('Booking is already cancelled');
    }

    if (booking.status === 'COMPLETED') {
      throw new BadRequestException('Cannot cancel completed booking');
    }

    const refundCalculation = FinancialUtil.calculateRefund(
      booking.totalPrice,
      new Date(),
      booking.checkIn,
      booking.property.cancellationPolicy,
    );

    // Find completed payment and trigger refund
    const payment = await this.prisma.payment.findFirst({
      where: { bookingId: id, status: PaymentStatus.COMPLETED },
    });

    let refundAmount = 0;
    if (payment) {
      refundAmount = (refundCalculation.refundPercentage / 100) * payment.amount;

      // Attempt Stripe refund (best-effort — test mode may not have a real charge)
      if (payment.stripeChargeId && refundAmount > 0 && process.env.STRIPE_SECRET_KEY) {
        try {
          const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
          await stripe.refunds.create({
            charge: payment.stripeChargeId,
            amount: Math.round(refundAmount * 100),
            reason: 'requested_by_customer',
            metadata: { bookingId: id, reason: cancelBookingDto.reason || '' },
          });
        } catch (_e) {
          // Stripe refund failed (e.g. test mode charge) — DB status still updated
        }
      }

      const newPaymentStatus =
        refundAmount >= payment.amount
          ? PaymentStatus.REFUNDED
          : refundAmount > 0
            ? PaymentStatus.PARTIALLY_REFUNDED
            : payment.status;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: newPaymentStatus,
          refundAmount,
          refundReason: cancelBookingDto.reason,
          refundedAt: new Date(),
        },
      });
    }

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        ...(payment && { paymentStatus: PaymentStatus.REFUNDED }),
      },
    });

    // Send cancellation email (non-blocking)
    const guestEmailAddr = booking.guestEmail || (await this.prisma.user.findUnique({ where: { id: booking.guestId || '' } }))?.email;
    if (guestEmailAddr) {
      this.emailService.sendBookingCancellation({
        guestName: booking.guestName || 'Guest',
        guestEmail: guestEmailAddr,
        bookingId: booking.id,
        propertyName: booking.property?.titleEn || booking.property?.titleGr || '',
        checkIn: booking.checkIn,
        checkOut: booking.checkOut,
        guests: booking.guests,
        totalPrice: booking.totalPrice,
        currency: booking.currency || 'EUR',
        refundAmount,
        refundPercentage: refundCalculation.refundPercentage,
        cancellationReason: cancelBookingDto.reason,
      }).catch(() => undefined);
    }

    return {
      success: true,
      message: 'Booking cancelled successfully',
      data: {
        ...updatedBooking,
        refundCalculation,
        refundAmount,
      },
    };
  }

  async markAsPaid(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isOwner = booking.property.ownerId === userId;
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

    if (!isOwner && !isAdmin) {
      throw new BadRequestException('Unauthorized to mark this booking as paid');
    }

    if (booking.paymentStatus === PaymentStatus.COMPLETED) {
      throw new BadRequestException('Booking is already marked as paid');
    }

    // Upsert a manual payment record
    await this.prisma.payment.create({
      data: {
        bookingId: booking.id,
        propertyId: booking.propertyId,
        amount: booking.totalPrice,
        currency: booking.currency || 'EUR',
        status: PaymentStatus.COMPLETED,
        method: 'BANK_TRANSFER' as any,
        processedAt: new Date(),
      },
    });

    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        paymentStatus: PaymentStatus.COMPLETED,
        status: 'CONFIRMED',
      },
    });

    return {
      success: true,
      message: 'Booking marked as paid',
      data: updatedBooking,
    };
  }

  async remove(id: string, userId: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = user?.role === 'ADMIN';

    if (!isAdmin) {
      throw new BadRequestException('Only admins can delete bookings');
    }

    await this.prisma.booking.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Booking deleted successfully',
    };
  }

  async reschedule(id: string, rescheduleDto: RescheduleBookingDto, userId: string): Promise<any> {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: true }
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isOwner = booking.property.ownerId === userId;
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

    if (!isOwner && !isAdmin) {
      throw new BadRequestException('Unauthorized to reschedule this booking');
    }

    const newCheckIn = new Date(rescheduleDto.newCheckIn);
    const newCheckOut = rescheduleDto.newCheckOut ? new Date(rescheduleDto.newCheckOut) : booking.checkOut;

    // Validate dates
    if (newCheckIn >= newCheckOut) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    if (newCheckIn < new Date()) {
      throw new BadRequestException('Cannot reschedule to past dates');
    }

    // Check availability for new dates
    const conflictWhere: any = {
      id: { not: booking.id }, // Exclude current booking
      status: { in: ['CONFIRMED', 'CHECKED_IN'] },
      OR: [{ checkIn: { lte: newCheckOut }, checkOut: { gte: newCheckIn } }],
    };

    if (rescheduleDto.roomId) {
      conflictWhere.roomId = rescheduleDto.roomId;
    } else {
      conflictWhere.roomId = booking.roomId;
      conflictWhere.propertyId = booking.propertyId;
    }

    const conflictingBookings = await this.prisma.booking.findMany({ where: conflictWhere });

    if (conflictingBookings.length > 0) {
      throw new BadRequestException('Selected dates are not available');
    }

    // Calculate new pricing if dates changed
    let newTotalPrice = booking.totalPrice;
    if (newCheckIn.getTime() !== booking.checkIn.getTime() || newCheckOut.getTime() !== booking.checkOut.getTime()) {
      const originalNights = Math.ceil((booking.checkOut.getTime() - booking.checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const newNights = Math.ceil((newCheckOut.getTime() - newCheckIn.getTime()) / (1000 * 60 * 60 * 24));
      
      if (originalNights !== newNights) {
        const pricePerNight = booking.totalPrice / originalNights;
        newTotalPrice = pricePerNight * newNights;
      }
    }

    // Update booking
    const updatedBooking = await this.prisma.booking.update({
      where: { id },
      data: {
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        totalPrice: newTotalPrice,
        basePrice: newTotalPrice,
        roomId: rescheduleDto.roomId || booking.roomId,
        ...(rescheduleDto.roomId && {
          roomName: (await this.prisma.room.findUnique({ where: { id: rescheduleDto.roomId } }))?.name
        })
      },
      include: {
        property: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
          },
        },
      },
    });

    return {
      success: true,
      message: 'Booking rescheduled successfully',
      data: updatedBooking
    };
  }
}

