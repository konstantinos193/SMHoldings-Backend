import { Controller, Get, Query, UseGuards, Res, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';
import { UserRole } from '../database/types';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.PROPERTY_OWNER, UserRole.MANAGER)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('types')
  async getReportTypes(@CurrentUserWithRole() user: any) {
    return this.reportsService.getReportTypes(user?.role);
  }

  /**
   * Generates the report and streams the CSV straight back. There is no stored
   * report history: the old `GET /reports` returned four hard-coded placeholder
   * rows, and its download route looked for a `.pdf` that generation never wrote.
   */
  @Get('download')
  async downloadReport(
    @Query('type') type: string,
    @Query('period') period: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @CurrentUser() userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!type) {
      throw new BadRequestException('Report type is required');
    }

    const { start, end } = this.resolveDateRange(period, startDate, endDate);
    const report = await this.reportsService.buildReport(type, start, end, userId);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
    // The browser can only read the filename cross-origin if it is exposed.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');

    return report.csv;
  }

  private resolveDateRange(
    period: string,
    startDate: string,
    endDate: string,
  ): { start: Date; end: Date } {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        // Include the whole of the end day, not just its first instant.
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
    }

    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start: Date;

    switch (period?.toUpperCase()) {
      case 'DAILY':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        break;
      case 'WEEKLY':
        start = new Date(end);
        start.setDate(end.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case 'YEARLY':
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
        break;
      case 'MONTHLY':
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
        break;
    }

    return { start, end };
  }
}
