import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ReportType {
  id: string;
  name: string;
  nameGr: string;
  description: string;
  descriptionGr: string;
  category: string;
}

export interface GeneratedReport {
  fileName: string;
  csv: string;
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private readonly reportTypes: ReportType[] = [
    {
      id: 'revenue',
      name: 'Revenue Report',
      nameGr: 'Αναφορά Εσόδων',
      description: 'Revenue per booking, with owner revenue and platform fees',
      descriptionGr: 'Έσοδα ανά κράτηση, με καθαρά έσοδα ιδιοκτήτη και προμήθειες',
      category: 'Financial',
    },
    {
      id: 'bookings',
      name: 'Bookings Report',
      nameGr: 'Αναφορά Κρατήσεων',
      description: 'Every booking in the period with guest and source',
      descriptionGr: 'Όλες οι κρατήσεις της περιόδου με επισκέπτη και πηγή',
      category: 'Operations',
    },
    {
      id: 'properties',
      name: 'Properties Performance',
      nameGr: 'Απόδοση Ακινήτων',
      description: 'Bookings, revenue and ratings per property',
      descriptionGr: 'Κρατήσεις, έσοδα και βαθμολογίες ανά ακίνητο',
      category: 'Performance',
    },
    {
      id: 'users',
      name: 'User Activity',
      nameGr: 'Δραστηριότητα Χρηστών',
      description: 'Users registered in the period and their activity',
      descriptionGr: 'Χρήστες που εγγράφηκαν στην περίοδο και η δραστηριότητά τους',
      category: 'Users',
    },
    {
      id: 'maintenance',
      name: 'Maintenance Report',
      nameGr: 'Αναφορά Συντήρησης',
      description: 'Maintenance requests and their resolution',
      descriptionGr: 'Αιτήματα συντήρησης και η επίλυσή τους',
      category: 'Operations',
    },
  ];

  /** The user report is admin-only, so non-admins never see a card that would 403. */
  async getReportTypes(userRole?: string) {
    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    const data = isAdmin
      ? this.reportTypes
      : this.reportTypes.filter((type) => type.id !== 'users');

    return { success: true, data };
  }

  /**
   * Builds the report in memory and hands back the CSV. Reports are generated on
   * demand rather than written to disk: the previous version wrote `<id>.csv` and
   * then looked for `<id>.pdf` on download, and nothing recorded what it had
   * generated, so no report was ever retrievable.
   */
  async buildReport(
    type: string,
    startDate: Date,
    endDate: Date,
    userId: string,
  ): Promise<GeneratedReport> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const reportType = this.reportTypes.find((rt) => rt.id === type);
    if (!reportType) {
      throw new BadRequestException('Invalid report type');
    }

    const isAdmin = user.role === 'ADMIN' || user.role === 'MANAGER';
    const rows = await this.buildRows(type, startDate, endDate, userId, isAdmin);
    const stamp = `${this.toDateKey(startDate)}_${this.toDateKey(endDate)}`;

    return { fileName: `${type}_${stamp}.csv`, csv: this.toCsv(rows) };
  }

  private async buildRows(
    type: string,
    startDate: Date,
    endDate: Date,
    userId: string,
    isAdmin: boolean,
  ): Promise<(string | number)[][]> {
    // Non-admins only ever see their own properties' data.
    const ownerScope = isAdmin ? {} : { property: { ownerId: userId } };

    switch (type) {
      case 'revenue':
        return this.revenueRows(startDate, endDate, ownerScope);
      case 'bookings':
        return this.bookingRows(startDate, endDate, ownerScope);
      case 'properties':
        return this.propertyRows(startDate, endDate, userId, isAdmin);
      case 'users':
        // The user report is platform-wide and cannot be scoped to one owner.
        if (!isAdmin) {
          throw new ForbiddenException('Insufficient permissions for the user report');
        }
        return this.userRows(startDate, endDate);
      case 'maintenance':
        return this.maintenanceRows(startDate, endDate, ownerScope);
      default:
        throw new BadRequestException('Unsupported report type');
    }
  }

  private async revenueRows(startDate: Date, endDate: Date, ownerScope: any) {
    const bookings = await this.prisma.booking.findMany({
      where: {
        ...ownerScope,
        checkIn: { gte: startDate, lte: endDate },
        status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
      },
      orderBy: { checkIn: 'asc' },
      include: { property: { select: { titleGr: true, titleEn: true } } },
    });

    const rows: (string | number)[][] = [
      [
        'Ακίνητο',
        'Επισκέπτης',
        'Άφιξη',
        'Αναχώρηση',
        'Σύνολο',
        'Έσοδα ιδιοκτήτη',
        'Προμήθεια',
        'Κατάσταση',
      ],
    ];

    for (const booking of bookings) {
      rows.push([
        booking.property?.titleGr || booking.property?.titleEn || '',
        booking.guestName,
        this.toDateKey(booking.checkIn),
        this.toDateKey(booking.checkOut),
        booking.totalPrice ?? 0,
        booking.ownerRevenue ?? 0,
        booking.platformFee ?? 0,
        booking.status,
      ]);
    }

    return rows;
  }

  private async bookingRows(startDate: Date, endDate: Date, ownerScope: any) {
    const bookings = await this.prisma.booking.findMany({
      where: { ...ownerScope, checkIn: { gte: startDate, lte: endDate } },
      orderBy: { checkIn: 'asc' },
      include: {
        property: { select: { titleGr: true, titleEn: true } },
        guest: { select: { name: true, email: true } },
      },
    });

    const rows: (string | number)[][] = [
      [
        'Ακίνητο',
        'Επισκέπτης',
        'Email',
        'Άφιξη',
        'Αναχώρηση',
        'Άτομα',
        'Σύνολο',
        'Κατάσταση',
        'Πηγή',
      ],
    ];

    for (const booking of bookings) {
      rows.push([
        booking.property?.titleGr || booking.property?.titleEn || '',
        booking.guestName,
        booking.guestEmail || booking.guest?.email || '',
        this.toDateKey(booking.checkIn),
        this.toDateKey(booking.checkOut),
        booking.guests ?? 0,
        booking.totalPrice ?? 0,
        booking.status,
        booking.source ?? '',
      ]);
    }

    return rows;
  }

  private async propertyRows(
    startDate: Date,
    endDate: Date,
    userId: string,
    isAdmin: boolean,
  ) {
    const properties = await this.prisma.property.findMany({
      where: isAdmin ? {} : { ownerId: userId },
      orderBy: { titleGr: 'asc' },
      include: {
        bookings: {
          where: {
            checkIn: { gte: startDate, lte: endDate },
            status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
          },
        },
        reviews: { where: { createdAt: { gte: startDate, lte: endDate } } },
      },
    });

    const rows: (string | number)[][] = [
      [
        'Ακίνητο',
        'Τύπος',
        'Πόλη',
        'Βασική τιμή',
        'Κρατήσεις',
        'Έσοδα',
        'Μ.Ο. βαθμολογίας',
        'Κριτικές',
      ],
    ];

    for (const property of properties) {
      const revenue = property.bookings.reduce(
        (sum, booking) => sum + (booking.ownerRevenue ?? 0),
        0,
      );
      const rating =
        property.reviews.length > 0
          ? property.reviews.reduce((sum, review) => sum + review.rating, 0) /
            property.reviews.length
          : 0;

      rows.push([
        property.titleGr || property.titleEn || '',
        property.type,
        property.city,
        property.basePrice ?? 0,
        property.bookings.length,
        Math.round(revenue * 100) / 100,
        rating > 0 ? rating.toFixed(2) : '',
        property.reviews.length,
      ]);
    }

    return rows;
  }

  private async userRows(startDate: Date, endDate: Date) {
    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
      include: {
        bookings: { where: { checkIn: { gte: startDate, lte: endDate } } },
        reviews: { where: { createdAt: { gte: startDate, lte: endDate } } },
      },
    });

    const rows: (string | number)[][] = [
      ['Όνομα', 'Email', 'Ρόλος', 'Ημ. εγγραφής', 'Κρατήσεις', 'Κριτικές'],
    ];

    for (const user of users) {
      rows.push([
        user.name || '',
        user.email,
        user.role,
        this.toDateKey(user.createdAt),
        user.bookings.length,
        user.reviews.length,
      ]);
    }

    return rows;
  }

  private async maintenanceRows(startDate: Date, endDate: Date, ownerScope: any) {
    const requests = await this.prisma.maintenanceRequest.findMany({
      where: { ...ownerScope, createdAt: { gte: startDate, lte: endDate } },
      orderBy: { createdAt: 'asc' },
      include: { property: { select: { titleGr: true, titleEn: true } } },
    });

    const rows: (string | number)[][] = [
      ['Ακίνητο', 'Τίτλος', 'Προτεραιότητα', 'Κατάσταση', 'Δημιουργήθηκε', 'Ολοκληρώθηκε'],
    ];

    for (const request of requests) {
      rows.push([
        request.property?.titleGr || request.property?.titleEn || '',
        request.title,
        request.priority,
        request.status,
        this.toDateKey(request.createdAt),
        request.completedAt ? this.toDateKey(request.completedAt) : '',
      ]);
    }

    return rows;
  }

  private toDateKey(date: Date): string {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate(),
    ).padStart(2, '0')}`;
  }

  /**
   * `;` separator plus a UTF-8 BOM so Excel in a Greek locale opens the file with
   * real columns and intact accents. Values are quoted — a property title with a
   * comma used to shift every following column.
   */
  private toCsv(rows: (string | number)[][]): string {
    const body = rows
      .map((row) =>
        row
          .map((cell) => {
            const value = String(cell ?? '');
            return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
          })
          .join(';'),
      )
      .join('\r\n');

    return `﻿${body}`;
  }
}