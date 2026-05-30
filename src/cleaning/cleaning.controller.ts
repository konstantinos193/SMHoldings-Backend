import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CleaningService } from './cleaning.service';
import { CreateCleaningScheduleDto } from './dto/create-cleaning-schedule.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('cleaning')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROPERTY_OWNER', 'ADMIN')
export class CleaningController {
  constructor(private readonly cleaningService: CleaningService) {}

  @Get()
  findAll(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('propertyId') propertyId: string,
    @Query('frequency') frequency: string,
    @Query('search') search: string,
    @CurrentUser() userId: string,
    @CurrentUserWithRole() authUser: any,
  ) {
    return this.cleaningService.findAll(
      { page: +page || 1, limit: +limit || 10, propertyId, frequency, search },
      userId,
      authUser?.role,
    );
  }

  @Get('stats')
  getStats(@CurrentUser() userId: string, @CurrentUserWithRole() authUser: any) {
    return this.cleaningService.getStats(userId, authUser?.role);
  }

  @Get('property/:propertyId')
  getPropertyCleanliness(@Param('propertyId') propertyId: string) {
    return this.cleaningService.getPropertyCleanliness(propertyId);
  }

  @Get('property/:propertyId/schedules')
  getSchedulesByProperty(
    @Param('propertyId') propertyId: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.cleaningService.getSchedulesByProperty(propertyId, user?.userId ?? user?.id, user?.role);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cleaningService.findOne(id);
  }

  @Post('schedule')
  createSchedule(
    @Body() createScheduleDto: CreateCleaningScheduleDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.cleaningService.createSchedule(createScheduleDto, user?.userId ?? user?.id, user?.role);
  }

  @Patch('schedule/:id')
  updateSchedule(
    @Param('id') id: string,
    @Body() updateDto: Partial<CreateCleaningScheduleDto>,
    @CurrentUserWithRole() user: any,
  ) {
    return this.cleaningService.updateSchedule(id, updateDto, user?.userId ?? user?.id, user?.role);
  }

  @Patch('schedule/:id/cleaned')
  updateCleaningDate(
    @Param('id') id: string,
    @Query('date') date: string,
    @CurrentUserWithRole() user: any,
  ) {
    const cleanedDate = date ? new Date(date) : new Date();
    return this.cleaningService.updateCleaningDate(id, cleanedDate, user?.userId ?? user?.id, user?.role);
  }

  @Delete('schedule/:id')
  removeSchedule(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.cleaningService.removeSchedule(id, user?.userId ?? user?.id, user?.role);
  }
}

