import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { AnalyticsPeriod } from '../database/types';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboardMetrics(
    @Query('period') period: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getDashboardMetrics(user?.userId ?? user?.id, user?.role, period || 'MONTHLY', startDate, endDate);
  }

  @Get('revenue-chart')
  getRevenueChart(
    @Query('period') period: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getRevenueChart(user?.userId ?? user?.id, user?.role, period || 'MONTHLY', startDate, endDate);
  }

  @Get('booking-trends')
  getBookingTrends(
    @Query('period') period: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getBookingTrends(user?.userId ?? user?.id, user?.role, period || 'MONTHLY', startDate, endDate);
  }

  @Get('user-distribution')
  getUserDistribution(@CurrentUserWithRole() user: any) {
    return this.analyticsService.getUserDistribution(user?.userId ?? user?.id, user?.role);
  }

  @Get('activity')
  getActivityData(
    @Query('period') period: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getActivityData(user?.userId ?? user?.id, user?.role, period || 'MONTHLY', startDate, endDate);
  }

  @Get('property/:propertyId')
  getPropertyAnalytics(
    @Param('propertyId') propertyId: string,
    @Query('period') period: AnalyticsPeriod,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getPropertyAnalytics(
      propertyId,
      period,
      new Date(startDate),
      new Date(endDate),
      user?.userId ?? user?.id,
      user?.role,
    );
  }

  @Get('financial')
  getFinancialAnalytics(
    @Query('period') period: AnalyticsPeriod,
    @CurrentUserWithRole() user: any,
  ) {
    return this.analyticsService.getFinancialAnalytics(user?.userId ?? user?.id, period);
  }
}
