import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';


@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users')
  getAllUsers(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getAllUsers(parseInt(page), parseInt(limit));
  }

  @Get('properties')
  getAllProperties(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getAllProperties(parseInt(page), parseInt(limit));
  }

  @Get('bookings')
  getAllBookings(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
  ) {
    return this.adminService.getAllBookings(parseInt(page), parseInt(limit));
  }

  @Get('audit-logs')
  getAuditLogs(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    return this.adminService.getAuditLogs(parseInt(page), parseInt(limit));
  }

  @Get('financial-report')
  getFinancialReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getFullYear(), end.getMonth(), 1);
    return this.adminService.getFinancialReport(start, end);
  }

  @Patch('users/:id/role')
  updateUserRole(@Param('id') id: string, @Body('role') role: string) {
    return this.adminService.updateUserRole(id, role);
  }

  @Patch('users/:id/status')
  toggleUserStatus(@Param('id') id: string) {
    return this.adminService.toggleUserStatus(id);
  }
}

