import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { BookingQueryDto } from './dto/booking-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('Bookings')
@ApiBearerAuth()
@Controller('bookings')
@UseGuards(JwtAuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all bookings' })
  findAll(@Query() query: BookingQueryDto) {
    return this.bookingsService.findAll(query);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export all bookings (no pagination limit)' })
  exportAll() {
    return this.bookingsService.exportAll();
  }

  @Post('public')
  @Public()
  @ApiOperation({ summary: 'Create public booking (no auth required)' })
  createPublic(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingsService.createPublic(createBookingDto);
  }

  @Post()
  @ApiOperation({ summary: 'Create booking' })
  create(@Body() createBookingDto: CreateBookingDto, @CurrentUser() userId: string) {
    return this.bookingsService.create(createBookingDto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update booking' })
  update(@Param('id') id: string, @Body() updateBookingDto: UpdateBookingDto) {
    return this.bookingsService.update(id, updateBookingDto);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule booking to different room/date' })
  reschedule(
    @Param('id') id: string,
    @Body() rescheduleDto: RescheduleBookingDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.bookingsService.reschedule(id, rescheduleDto, user?.userId ?? user?.id, user?.role);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel booking' })
  cancel(
    @Param('id') id: string,
    @Body() cancelBookingDto: CancelBookingDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.bookingsService.cancel(id, cancelBookingDto, user?.userId ?? user?.id, user?.role);
  }

  @Post(':id/mark-paid')
  @ApiOperation({ summary: 'Mark booking as paid (admin/owner only)' })
  markAsPaid(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.bookingsService.markAsPaid(id, user?.userId ?? user?.id, user?.role);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Delete booking (admin only)' })
  remove(@Param('id') id: string) {
    return this.bookingsService.remove(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single booking' })
  findOne(@Param('id') id: string) {
    return this.bookingsService.findOne(id);
  }
}
