import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { CreatePublicCheckoutSessionDto } from './dto/create-public-checkout-session.dto';
import Stripe from 'stripe';

type StripeInstance = ReturnType<typeof Stripe>;
type StripeEvent = ReturnType<StripeInstance['webhooks']['constructEvent']>;
type StripePaymentIntent = { id: string };
type StripeCheckoutSession = {
  id: string;
  metadata?: Record<string, string> | null;
  client_reference_id?: string | null;
  payment_intent?: string | { id: string } | null;
  payment_status?: string | null;
};
import { PaymentStatus, PaymentMethod } from '../database/types';
import { BookingsService } from '../bookings/bookings.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class PaymentsService {
  private stripe: InstanceType<typeof Stripe>;

  constructor(
    private prisma: PrismaService,
    private bookingsService: BookingsService,
    private emailService: EmailService,
  ) {
    // Stripe will use the account's default API version
    // or you can specify: apiVersion: '2024-11-20.acacia' as const
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
  }

  async createPublicCheckoutSession(
    dto: CreatePublicCheckoutSessionDto,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new BadRequestException('Stripe is not configured');
    }

    // Calculate price without creating a booking — booking is only created after payment succeeds
    const { totalPrice, currency } = await this.bookingsService.calculateBookingPrice({
      propertyId: dto.propertyId,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guests: dto.guests,
      roomId: dto.roomId,
    });

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: dto.successUrl,
      cancel_url: dto.cancelUrl,
      payment_method_types: ['card'],
      customer_email: dto.guestEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: Math.round(totalPrice * 100),
            product_data: {
              name: dto.roomName || "L'Incanto Hotel",
              description: `${dto.checkIn} to ${dto.checkOut} (${dto.guests} guests)`,
            },
          },
        },
      ],
      // Store all booking data in metadata so the webhook can create the booking after payment
      metadata: {
        propertyId: dto.propertyId,
        checkIn: dto.checkIn,
        checkOut: dto.checkOut,
        guests: String(dto.guests),
        guestName: dto.guestName,
        guestEmail: dto.guestEmail,
        guestPhone: dto.guestPhone || '',
        specialRequests: (dto.specialRequests || '').slice(0, 490),
        roomId: dto.roomId || '',
        roomName: (dto.roomName || '').slice(0, 490),
      },
      payment_intent_data: {
        metadata: {
          propertyId: dto.propertyId,
          guestEmail: dto.guestEmail,
          roomId: dto.roomId || '',
        },
      },
    }).catch((error) => {
      throw new BadRequestException(`Checkout session creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    });

    if (!session.url) {
      throw new BadRequestException('Stripe checkout URL was not generated');
    }

    return { checkoutUrl: session.url, sessionId: session.id };
  }

  async processPayment(
    createPaymentDto: CreatePaymentDto,
    userId: string,
  ): Promise<PaymentResponseDto> {
    // Get booking details
    const booking = await this.prisma.booking.findUnique({
      where: { id: createPaymentDto.bookingId },
      include: { property: true, guest: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Verify booking belongs to user
    if (booking.guestId !== userId) {
      throw new BadRequestException('Unauthorized to pay for this booking');
    }

    // Verify booking is in pending payment status
    if (booking.paymentStatus !== PaymentStatus.PENDING) {
      throw new BadRequestException('Booking payment already processed');
    }

    // Verify amount matches booking total
    if (Math.abs(createPaymentDto.amount - booking.totalPrice) > 0.01) {
      throw new BadRequestException('Payment amount does not match booking total');
    }

    try {
      // Create Stripe Payment Intent
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(createPaymentDto.amount * 100), // Convert to cents
        currency: createPaymentDto.currency || 'eur',
        payment_method_types: this.getStripePaymentMethods(createPaymentDto.method),
        metadata: {
          bookingId: booking.id,
          propertyId: booking.propertyId,
          guestId: booking.guestId,
        },
      });

      // Create payment record
      const payment = await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          propertyId: booking.propertyId,
          amount: createPaymentDto.amount,
          currency: createPaymentDto.currency || 'EUR',
          status: PaymentStatus.PENDING,
          method: createPaymentDto.method,
          stripePaymentIntentId: paymentIntent.id,
        },
      });

      // Payment is automatically linked to booking via bookingId foreign key
      // No need to update booking since the relation is one-to-many

      return this.mapToResponseDto(payment);
    } catch (error) {
      throw new BadRequestException(`Payment processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async confirmPayment(paymentIntentId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { 
        booking: {
          include: {
            property: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    try {
      // Retrieve payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status === 'succeeded') {
        // Fetch Stripe receipt URL from the charge
        let stripeReceiptUrl: string | undefined;
        if (paymentIntent.latest_charge) {
          try {
            const charge = await this.stripe.charges.retrieve(paymentIntent.latest_charge as string);
            stripeReceiptUrl = charge.receipt_url ?? undefined;
          } catch {
            // receipt URL is optional — don't block the flow
          }
        }

        // Update payment status
        const updatedPayment = await this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            stripeChargeId: paymentIntent.latest_charge as string,
            processedAt: new Date(),
          },
        });

        // Update booking status
        const confirmedBooking = await this.prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            paymentStatus: PaymentStatus.COMPLETED,
            status: 'CONFIRMED',
          },
          include: {
            property: { select: { titleEn: true, titleGr: true } },
          },
        });

        // Send confirmation email now that payment is confirmed
        const guestEmail = confirmedBooking.guestEmail;
        if (guestEmail) {
          this.emailService.sendBookingConfirmation({
            guestName: confirmedBooking.guestName || 'Guest',
            guestEmail,
            bookingId: confirmedBooking.id,
            propertyName: confirmedBooking.property?.titleEn || confirmedBooking.property?.titleGr || '',
            roomName: confirmedBooking.roomName || undefined,
            checkIn: confirmedBooking.checkIn,
            checkOut: confirmedBooking.checkOut,
            guests: confirmedBooking.guests,
            totalPrice: confirmedBooking.totalPrice,
            currency: confirmedBooking.currency || 'EUR',
            stripePaymentIntentId: paymentIntent.id,
            stripeReceiptUrl,
          }).catch(() => undefined);
        }

        // Calculate owner revenue (after platform fees)
        const property = await this.prisma.property.findUnique({
          where: { id: payment.propertyId },
          select: {
            serviceFeePercentage: true,
          },
        });
        const platformFee = 0; // No platform fee
        const ownerRevenue = payment.amount - platformFee;

        await this.prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            platformFee: platformFee,
            ownerRevenue: ownerRevenue,
          },
        });

        return this.mapToResponseDto(updatedPayment);
      }

      return this.mapToResponseDto(payment);
    } catch (error) {
      throw new BadRequestException(`Payment confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async refundPayment(
    refundPaymentDto: RefundPaymentDto,
    userId: string,
  ): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: refundPaymentDto.paymentId },
      include: { booking: true, property: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify user has permission (owner or admin)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isOwner = payment.property.ownerId === userId;
    const isAdmin = user?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new BadRequestException('Unauthorized to refund this payment');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded');
    }

    const refundAmount = refundPaymentDto.amount || payment.amount;

    if (refundAmount > payment.amount) {
      throw new BadRequestException('Refund amount cannot exceed payment amount');
    }

    try {
      // Process refund through Stripe
      let refund;
      if (payment.stripeChargeId) {
        refund = await this.stripe.refunds.create({
          charge: payment.stripeChargeId,
          amount: Math.round(refundAmount * 100), // Convert to cents
          reason: refundPaymentDto.reason ? 'requested_by_customer' : 'duplicate',
          metadata: {
            paymentId: payment.id,
            bookingId: payment.bookingId,
            reason: refundPaymentDto.reason || '',
          },
        });
      }

      // Update payment record
      const updatedPayment = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          refundAmount,
          refundReason: refundPaymentDto.reason,
          refundedAt: new Date(),
          status:
            refundAmount === payment.amount
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED,
        },
      });

      // Update booking status if full refund
      if (refundAmount === payment.amount) {
        await this.prisma.booking.update({
          where: { id: payment.bookingId },
          data: {
            paymentStatus: PaymentStatus.REFUNDED,
            status: 'CANCELLED',
          },
        });
      }

      return this.mapToResponseDto(updatedPayment);
    } catch (error) {
      throw new BadRequestException(`Refund processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleStripeWebhook(payload: any, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    let event: StripeEvent;

    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      throw new BadRequestException(`Webhook signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Handle different event types
    switch (event.type) {
      case 'payment_intent.succeeded':
        try {
          await this.confirmPayment((event.data.object as StripePaymentIntent).id);
        } catch (error) {
          // Some Stripe flows may trigger this before we store a matching payment record.
          if (!(error instanceof NotFoundException)) {
            throw error;
          }
        }
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailure(event.data.object.id);
        break;

      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event.data.object as StripeCheckoutSession);
        break;

      case 'charge.refunded':
        // Refund handled separately via API
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private async handlePaymentFailure(paymentIntentId: string): Promise<void> {
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (payment) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED },
      });

      await this.prisma.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
    }
  }

  private async handleCheckoutSessionCompleted(session: StripeCheckoutSession): Promise<void> {
    // Idempotency: if we already processed this session, skip
    const existingPayment = await this.prisma.payment.findFirst({
      where: { transactionId: session.id },
    });
    if (existingPayment?.status === PaymentStatus.COMPLETED) {
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string' ? session.payment_intent : null;

    let booking: any;
    let payment = existingPayment;

    if (!existingPayment) {
      // New flow: booking data lives in Stripe metadata, create booking now that payment succeeded
      const meta = session.metadata || {};
      const propertyId = meta.propertyId;
      const guestEmail = meta.guestEmail;
      const checkIn = meta.checkIn;
      const checkOut = meta.checkOut;

      if (!propertyId || !guestEmail || !checkIn || !checkOut) {
        // Old-style session with bookingId in metadata (should not happen after this fix)
        return;
      }

      let bookingResponse: any;
      try {
        bookingResponse = await this.bookingsService.createPublic({
          propertyId,
          checkIn,
          checkOut,
          guests: parseInt(meta.guests || '1', 10),
          guestName: meta.guestName || guestEmail,
          guestEmail,
          guestPhone: meta.guestPhone || undefined,
          specialRequests: meta.specialRequests || undefined,
          roomId: meta.roomId || undefined,
          roomName: meta.roomName || undefined,
          paymentMethod: 'credit_card',
        });
      } catch (err) {
        console.error('[Stripe webhook] Failed to create booking from session metadata:', err);
        return;
      }

      booking = bookingResponse?.data;
      if (!booking?.id) return;

      payment = await this.prisma.payment.create({
        data: {
          bookingId: booking.id,
          propertyId: booking.propertyId,
          amount: booking.totalPrice,
          currency: booking.currency || 'EUR',
          status: PaymentStatus.PENDING,
          method: PaymentMethod.CREDIT_CARD,
          transactionId: session.id,
          stripePaymentIntentId: paymentIntentId || undefined,
        },
      });
    } else {
      booking = await this.prisma.booking.findUnique({ where: { id: existingPayment.bookingId } });
      if (!booking) return;

      if (!payment!.stripePaymentIntentId && paymentIntentId) {
        payment = await this.prisma.payment.update({
          where: { id: payment!.id },
          data: { stripePaymentIntentId: paymentIntentId, transactionId: session.id },
        });
      }
    }

    if (paymentIntentId) {
      try {
        await this.confirmPayment(paymentIntentId);
        return;
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
      }
    }

    if (payment!.status === PaymentStatus.COMPLETED) {
      return;
    }

    const platformFee = 0;
    const ownerRevenue = payment!.amount - platformFee;

    await this.prisma.payment.update({
      where: { id: payment!.id },
      data: {
        status: PaymentStatus.COMPLETED,
        processedAt: new Date(),
        transactionId: session.id,
        stripePaymentIntentId: paymentIntentId || payment!.stripePaymentIntentId,
      },
    });

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        paymentStatus: PaymentStatus.COMPLETED,
        status: 'CONFIRMED',
        platformFee,
        ownerRevenue,
      },
    });
  }

  async confirmCheckoutSession(sessionId: string): Promise<{ status: string; bookingId: string | null }> {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new BadRequestException('Stripe is not configured');
    }

    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === 'paid') {
        await this.handleCheckoutSessionCompleted(session as StripeCheckoutSession);

        const payment = await this.prisma.payment.findFirst({
          where: { transactionId: sessionId },
        });
        return { status: 'COMPLETED', bookingId: payment?.bookingId || null };
      }

      return { status: session.payment_status || 'PENDING', bookingId: null };
    } catch (error) {
      throw new BadRequestException(`Session confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPaymentById(paymentId: string, userId: string): Promise<PaymentResponseDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { booking: true, property: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify user has access
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isGuest = payment.booking.guestId === userId;
    const isOwner = payment.property.ownerId === userId;
    const isAdmin = user?.role === 'ADMIN';

    if (!isGuest && !isOwner && !isAdmin) {
      throw new BadRequestException('Unauthorized to view this payment');
    }

    return this.mapToResponseDto(payment);
  }

  async getAll(params: {
    page?: number;
    limit?: number;
    status?: string;
    method?: string;
    bookingId?: string;
    propertyId?: string;
  }, userId: string): Promise<any> {
    const page = +( params.page || 1);
    const limit = +(params.limit || 10);
    const skip = (page - 1) * limit;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';

    const where: any = {};
    if (!isAdmin) {
      where.property = { ownerId: userId };
    }
    if (params.status) where.status = params.status;
    if (params.method) where.method = params.method;
    if (params.bookingId) where.bookingId = params.bookingId;
    if (params.propertyId) where.propertyId = params.propertyId;

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          booking: { select: { id: true, guestName: true, checkIn: true, checkOut: true } },
          property: { select: { id: true, titleGr: true, titleEn: true } },
        },
      }),
      this.prisma.payment.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);
    return {
      success: true,
      data: {
        payments,
        pagination: { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      },
    };
  }

  async refundById(paymentId: string, amount: number | undefined, reason: string | undefined, userId: string): Promise<PaymentResponseDto> {
    return this.refundPayment({ paymentId, amount, reason }, userId);
  }

  async schedulePayout(paymentId: string, scheduledFor: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { property: true } });
    if (!payment) throw new NotFoundException('Payment not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
    const isOwner = payment.property?.ownerId === userId;
    if (!isAdmin && !isOwner) throw new BadRequestException('Unauthorized');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { payoutScheduledFor: new Date(scheduledFor), payoutStatus: 'SCHEDULED' },
    });
    return { success: true, data: this.mapToResponseDto(updated) };
  }

  async markPayoutSent(paymentId: string, userId: string) {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId }, include: { property: true } });
    if (!payment) throw new NotFoundException('Payment not found');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
    if (!isAdmin) throw new BadRequestException('Only admins can mark payouts as sent');

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { payoutStatus: 'PAID', payoutId: `manual_${Date.now()}` },
    });
    return { success: true, data: this.mapToResponseDto(updated) };
  }

  async getOwnerPayouts(ownerId: string): Promise<any[]> {
    const payments = await this.prisma.payment.findMany({
      where: {
        property: { ownerId },
        status: PaymentStatus.COMPLETED,
      },
      include: {
        booking: true,
        property: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((payment) => ({
      id: payment.id,
      bookingId: payment.bookingId,
      propertyId: payment.propertyId,
      propertyTitle: payment.property.titleEn,
      amount: payment.amount,
      ownerRevenue: payment.booking.ownerRevenue,
      platformFee: payment.booking.platformFee,
      payoutStatus: payment.payoutStatus,
      payoutScheduledFor: payment.payoutScheduledFor,
      processedAt: payment.processedAt,
      createdAt: payment.createdAt,
    }));
  }

  private getStripePaymentMethods(method: PaymentMethod): string[] {
    switch (method) {
      case PaymentMethod.CREDIT_CARD:
      case PaymentMethod.DEBIT_CARD:
        return ['card'];
      case PaymentMethod.APPLE_PAY:
        return ['card', 'apple_pay'];
      case PaymentMethod.GOOGLE_PAY:
        return ['card', 'google_pay'];
      case PaymentMethod.PAYPAL:
        return ['paypal'];
      case PaymentMethod.STRIPE_LINK:
        return ['link'];
      default:
        return ['card'];
    }
  }

  private mapToResponseDto(payment: any): PaymentResponseDto {
    return {
      id: payment.id,
      bookingId: payment.bookingId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      method: payment.method,
      transactionId: payment.transactionId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      refundAmount: payment.refundAmount,
      processedAt: payment.processedAt,
      createdAt: payment.createdAt,
    };
  }
}

