import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { UpdateMaintenanceRequestDto } from './dto/update-maintenance-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PROPERTY_OWNER', 'ADMIN', 'MANAGER')
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('propertyId') propertyId?: string,
    @CurrentUser() userId?: string,
    @CurrentUserWithRole() authUser?: any,
  ) {
    return this.maintenanceService.findAll({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      status,
      priority,
      propertyId,
      userId,
      userRole: authUser?.role,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.maintenanceService.findOne(id, user?.userId ?? user?.id, user?.role);
  }

  @Post()
  create(
    @Body() createMaintenanceRequestDto: CreateMaintenanceRequestDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.maintenanceService.create(createMaintenanceRequestDto, user?.userId ?? user?.id, user?.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMaintenanceRequestDto: UpdateMaintenanceRequestDto,
    @CurrentUserWithRole() user: any,
  ) {
    return this.maintenanceService.update(id, updateMaintenanceRequestDto, user?.userId ?? user?.id, user?.role);
  }

  @Post(':id/assign')
  assign(
    @Param('id') id: string,
    @Body('assignedTo') assignedTo: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.maintenanceService.assign(id, assignedTo, user?.userId ?? user?.id, user?.role);
  }

  @Post(':id/complete')
  complete(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.maintenanceService.complete(id, user?.userId ?? user?.id, user?.role);
  }
}
