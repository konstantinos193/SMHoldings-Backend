import { Controller, Get, Post, Body, Patch, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ExternalBookingsService } from './external-bookings.service';
import { CreateExternalBookingDto } from './dto/create-external-booking.dto';
import { UpdateExternalBookingDto } from './dto/update-external-booking.dto';
import { QueryExternalBookingsDto } from './dto/query-external-bookings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@ApiTags('External Bookings')
@Controller('external-bookings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ExternalBookingsController {
  constructor(private readonly externalBookingsService: ExternalBookingsService) {}

  @Post('import')
  @ApiOperation({ summary: 'Import a single booking from an external platform (Booking.com, Airbnb, etc.)' })
  @ApiResponse({ status: 201, description: 'Booking imported successfully' })
  @ApiResponse({ status: 409, description: 'Booking already imported (duplicate externalId)' })
  importBooking(@Body() dto: CreateExternalBookingDto) {
    return this.externalBookingsService.importBooking(dto);
  }

  @Post('import/bulk')
  @ApiOperation({ summary: 'Bulk import bookings from an external platform' })
  @ApiResponse({ status: 201, description: 'Bulk import results' })
  bulkImport(@Body() bookings: CreateExternalBookingDto[]) {
    return this.externalBookingsService.bulkImport(bookings);
  }

  @Patch(':id/sync')
  @ApiOperation({ summary: 'Sync/update an external booking (e.g. date change or cancellation from platform)' })
  @ApiResponse({ status: 200, description: 'Booking synced successfully' })
  syncBooking(@Param('id') id: string, @Body() dto: UpdateExternalBookingDto) {
    return this.externalBookingsService.syncBooking(id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all external bookings (non-DIRECT)' })
  @ApiQuery({ name: 'source', required: false, enum: ['BOOKING_COM', 'AIRBNB', 'VRBO', 'EXPEDIA', 'MANUAL', 'OTHER'] })
  @ApiResponse({ status: 200 })
  findAllExternal(@Query() query: QueryExternalBookingsDto) {
    return this.externalBookingsService.findAllExternal(query);
  }

  @Get('revenue-by-source')
  @ApiOperation({ summary: 'Get revenue breakdown by booking source (direct vs external platforms)' })
  @ApiResponse({ status: 200 })
  getRevenueBySource() {
    return this.externalBookingsService.getRevenueBySource();
  }

  @Get('lookup/:source/:externalId')
  @ApiOperation({ summary: 'Find a booking by its external platform ID' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  findByExternalId(
    @Param('source') source: string,
    @Param('externalId') externalId: string,
  ) {
    return this.externalBookingsService.findByExternalId(source, externalId);
  }
}
