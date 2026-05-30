import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { CreatePricingRuleDto, UpdatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdateRoomAvailabilityDto } from './dto/update-room-availability.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Public } from '../common/decorators/public.decorator';

@ApiTags('rooms')
@ApiBearerAuth()
@Controller('rooms')
@UseGuards(JwtAuthGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  // ─── Public routes ────────────────────────────────────────────────────────

  @Public()
  @Get('public/all')
  findAllPublic() {
    return this.roomsService.findAllPublic();
  }

  @Public()
  @Get('public/search')
  findAvailablePublic(
    @Query('checkIn') checkIn: string,
    @Query('checkOut') checkOut: string,
    @Query('guests') guests?: string,
    @Query('adults') adults?: string,
    @Query('children') children?: string,
  ) {
    return this.roomsService.findAvailablePublic(
      checkIn,
      checkOut,
      guests ? Number(guests) : undefined,
      adults !== undefined ? Number(adults) : undefined,
      children !== undefined ? Number(children) : undefined,
    );
  }

  @Public()
  @Get('public/occupancy')
  getOccupancy(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.roomsService.getOccupancyForRange(startDate, endDate);
  }

  @Public()
  @Get('public/min-price')
  getMinPrice() {
    return this.roomsService.getMinPrice();
  }

  @Public()
  @Get('dashboard-stats')
  getDashboardStats() {
    return this.roomsService.getDashboardStats();
  }

  @Public()
  @Get('bookable')
  findAllBookable() {
    return this.roomsService.findAllBookable();
  }

  @Public()
  @Get('public/:id')
  findOnePublic(@Param('id') id: string) {
    return this.roomsService.findOnePublic(id);
  }

  @Public()
  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.roomsService.getRoomAvailability(id, new Date(startDate), new Date(endDate));
  }

  // ─── Authenticated routes ─────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'MANAGER', 'PROPERTY_OWNER')
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Get all rooms (authenticated)' })
  findAllAuth() {
    return this.roomsService.findAllPublic();
  }

  @Post()
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  create(@Body() createRoomDto: CreateRoomDto, @CurrentUserWithRole() user: any) {
    return this.roomsService.create(createRoomDto, this.getUserId(user));
  }

  @Get('property/:propertyId')
  findAll(
    @Param('propertyId') propertyId: string,
    @CurrentUserWithRole() user?: any,
  ) {
    return this.roomsService.findAll(propertyId, this.getUserId(user));
  }

  @Patch(':id')
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  update(
    @Param('id') id: string,
    @Body() updateRoomDto: UpdateRoomDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.roomsService.update(id, updateRoomDto, this.getUserId(user), user.role);
  }

  @Delete(':id')
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  remove(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.roomsService.remove(id, this.getUserId(user), user.role);
  }

  @Get(':id/pricing-rules')
  @Roles('PROPERTY_OWNER', 'ADMIN', 'MANAGER')
  @UseGuards(RolesGuard)
  getPricingRules(@Param('id') id: string) {
    return this.roomsService.getPricingRules(id);
  }

  @Post(':id/pricing-rules')
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  createPricingRule(@Param('id') id: string, @Body() dto: CreatePricingRuleDto) {
    return this.roomsService.createPricingRule(id, dto);
  }

  @Patch(':id/pricing-rules/:ruleId')
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  updatePricingRule(
    @Param('id') id: string,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    return this.roomsService.updatePricingRule(id, ruleId, dto);
  }

  @Delete(':id/pricing-rules/:ruleId')
  @Roles('PROPERTY_OWNER', 'ADMIN')
  @UseGuards(RolesGuard)
  deletePricingRule(@Param('id') id: string, @Param('ruleId') ruleId: string) {
    return this.roomsService.deletePricingRule(id, ruleId);
  }

  @Get(':id/availability-calendar')
  @Roles('PROPERTY_OWNER', 'ADMIN', 'MANAGER')
  @UseGuards(RolesGuard)
  getAvailabilityCalendar(
    @Param('id') id: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.roomsService.getAvailabilityCalendar(id, Number(year), Number(month));
  }

  @Patch(':id/availability')
  @Roles('PROPERTY_OWNER', 'ADMIN', 'MANAGER')
  @UseGuards(RolesGuard)
  updateAvailability(
    @Param('id') id: string,
    @Body() body: UpdateRoomAvailabilityDto,
  ) {
    return this.roomsService.updateAvailability(id, body);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserWithRole() user?: any) {
    return this.roomsService.findOne(id, this.getUserId(user));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getUserId(user?: any): string | undefined {
    return user?.userId ?? user?.id;
  }
}
