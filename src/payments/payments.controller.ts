import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  RawBodyRequest,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { CreatePublicCheckoutSessionDto } from './dto/create-public-checkout-session.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  async getAllPayments(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('method') method: string,
    @Query('bookingId') bookingId: string,
    @Query('propertyId') propertyId: string,
    @CurrentUser() userId: string,
  ) {
    return this.paymentsService.getAll({ page: +page || 1, limit: +limit || 10, status, method, bookingId, propertyId }, userId);
  }

  @Post('public/checkout-session')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  async createPublicCheckoutSession(
    @Body() createPublicCheckoutSessionDto: CreatePublicCheckoutSessionDto,
  ): Promise<{ checkoutUrl: string; sessionId: string }> {
    return this.paymentsService.createPublicCheckoutSession(createPublicCheckoutSessionDto);
  }

  @Post('process')
  @HttpCode(HttpStatus.CREATED)
  async processPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.processPayment(createPaymentDto, userId);
  }

  @Post('confirm/:paymentIntentId')
  @HttpCode(HttpStatus.OK)
  async confirmPayment(
    @Param('paymentIntentId') paymentIntentId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.confirmPayment(paymentIntentId);
  }

  @Post('public/confirm-session')
  @Public()
  @HttpCode(HttpStatus.OK)
  async confirmCheckoutSession(
    @Body() body: { sessionId: string },
  ): Promise<{ status: string; bookingId: string | null }> {
    return this.paymentsService.confirmCheckoutSession(body.sessionId);
  }

  @Post('refund')
  @HttpCode(HttpStatus.OK)
  async refundPayment(
    @Body() refundPaymentDto: RefundPaymentDto,
    @CurrentUser() userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.refundPayment(refundPaymentDto, userId);
  }

  @Post(':id/refund')
  @HttpCode(HttpStatus.OK)
  async refundPaymentById(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
    @CurrentUser() userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.refundById(id, body.amount, body.reason, userId);
  }

  @Get(':id')
  async getPayment(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ): Promise<PaymentResponseDto> {
    return this.paymentsService.getPaymentById(id, userId);
  }

  @Get('owner/payouts')
  async getOwnerPayouts(@CurrentUser() userId: string): Promise<any[]> {
    return this.paymentsService.getOwnerPayouts(userId);
  }

  @Patch(':id/schedule-payout')
  async schedulePayout(
    @Param('id') id: string,
    @Body() body: { scheduledFor: string },
    @CurrentUser() userId: string,
  ) {
    return this.paymentsService.schedulePayout(id, body.scheduledFor, userId);
  }

  @Patch(':id/mark-payout-sent')
  async markPayoutSent(
    @Param('id') id: string,
    @CurrentUser() userId: string,
  ) {
    return this.paymentsService.markPayoutSent(id, userId);
  }

  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: boolean }> {
    const signature = req.headers['stripe-signature'] as string;
    const payload = req.rawBody;

    await this.paymentsService.handleStripeWebhook(payload, signature);

    return { received: true };
  }
}

