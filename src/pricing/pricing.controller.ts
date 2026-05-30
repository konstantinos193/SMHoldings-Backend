import { Controller, Get, Query, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialUtil } from '../common/utils/financial.util';
import { computeNightlySubtotal } from '../common/utils/price.util';

@ApiTags('Pricing')
@Controller('pricing')
export class PricingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('calculate')
  @Public()
  @ApiOperation({ summary: 'Calculate total price for a booking' })
  async calculatePrice(
    @Query('propertyId') propertyId: string,
    @Query('roomId') roomId?: string,
    @Query('checkIn') checkIn?: string,
    @Query('checkOut') checkOut?: string,
    @Query('guests') guests?: number,
  ) {
    if (!propertyId || !checkIn || !checkOut || !guests) {
      throw new BadRequestException('propertyId, checkIn, checkOut, and guests are required');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        basePrice: true,
        cleaningFee: true,
        serviceFeePercentage: true,
        taxRate: true,
        currency: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

    let effectivePricePerNight = property.basePrice;

    if (roomId) {
      const room = await this.prisma.room.findUnique({
        where: { id: roomId },
        include: {
          availabilityRules: {
            where: {
              startDate: { lte: checkOutDate },
              endDate: { gte: checkInDate },
              isAvailable: true,
            },
            orderBy: { startDate: 'asc' },
          },
        },
      });

      if (room) {
        const { subtotal, nights: n } = computeNightlySubtotal(room.basePrice, room.availabilityRules, checkInDate, checkOutDate);
        effectivePricePerNight = n > 0 ? subtotal / n : room.basePrice;
      }
    }

    const priceBreakdown = FinancialUtil.calculateTotalPrice(
      effectivePricePerNight,
      nights,
      guests,
      0, 0, 0, 0,
      property.currency || 'EUR',
    );

    return { success: true, data: priceBreakdown };
  }
}
