import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { ContactInquiryDto, ContactSubject } from './dto/contact-inquiry.dto';

const CONTACT_SUBJECT_LABEL: Record<ContactSubject, string> = {
  owner: 'Property owner — advice',
  rent: 'Looking to rent',
  buy: 'Looking to buy',
  management: 'Property management request',
  investment: 'Investment guidance',
  other: 'General enquiry',
};

const PROPERTY_SELECT = {
  id: true,
  titleEn: true,
  titleGr: true,
  owner: { select: { id: true, name: true, email: true } },
};

const ASSIGNEE_SELECT = { id: true, name: true, email: true };

@Injectable()
export class InquiriesService {
  private readonly logger = new Logger(InquiriesService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  /**
   * Website contact form (smholdings.gr/contact). Not tied to a property, so it
   * is emailed to the office and confirmed to the sender rather than stored in
   * the property-bound Inquiry table.
   */
  async contact(dto: ContactInquiryDto) {
    const reference = randomUUID();
    const subject = CONTACT_SUBJECT_LABEL[dto.subject] ?? CONTACT_SUBJECT_LABEL.other;
    const context = [subject, dto.propertyLocation && `Location: ${dto.propertyLocation}`, dto.phone && `Phone: ${dto.phone}`]
      .filter(Boolean)
      .join(' · ');

    const payload = {
      inquiryId: reference,
      guestName: dto.name,
      guestEmail: dto.email,
      propertyName: context,
      message: dto.message,
      lang: dto.lang ?? 'en',
    };

    try {
      await this.email.sendInquiryNotificationToAdmin(payload);
      await this.email.sendInquiryConfirmationToGuest(payload);
    } catch (err) {
      this.logger.error(`Contact enquiry email failed (${reference})`, err instanceof Error ? err.stack : String(err));
      throw err;
    }

    return { success: true, reference: reference.slice(-8).toUpperCase() };
  }

  async create(createInquiryDto: CreateInquiryDto) {
    const { propertyId, ...inquiryData } = createInquiryDto;

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const inquiry = await this.prisma.inquiry.create({
      data: { ...inquiryData, propertyId },
      include: {
        property: { select: PROPERTY_SELECT },
        assignee: { select: ASSIGNEE_SELECT },
      },
    });

    return inquiry;
  }

  async findAll(
    status?: string,
    priority?: string,
    assignedTo?: string,
    page = 1,
    limit = 10,
  ) {
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (assignedTo) where.assignedTo = assignedTo;

    const skip = (page - 1) * limit;

    const [inquiries, total] = await Promise.all([
      this.prisma.inquiry.findMany({
        where,
        skip,
        take: limit,
        include: {
          property: { select: PROPERTY_SELECT },
          assignee: { select: ASSIGNEE_SELECT },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inquiry.count({ where }),
    ]);

    return {
      inquiries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        property: { select: PROPERTY_SELECT },
        assignee: { select: ASSIGNEE_SELECT },
      },
    });

    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }

    return inquiry;
  }

  async update(id: string, updateInquiryDto: UpdateInquiryDto) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }

    const updateData: any = { ...updateInquiryDto };

    if (updateInquiryDto.status === 'RESPONDED' && inquiry.status !== 'RESPONDED') {
      updateData.respondedAt = new Date();
    }

    return this.prisma.inquiry.update({
      where: { id },
      data: updateData,
      include: {
        property: { select: PROPERTY_SELECT },
        assignee: { select: ASSIGNEE_SELECT },
      },
    });
  }

  async remove(id: string) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!inquiry) {
      throw new NotFoundException('Inquiry not found');
    }

    return this.prisma.inquiry.delete({ where: { id } });
  }

  async getStats() {
    const [statusStats, priorityStats] = await Promise.all([
      this.prisma.inquiry.groupBy({ by: ['status'], _count: { id: true } }),
      this.prisma.inquiry.groupBy({ by: ['priority'], _count: { id: true } }),
    ]);

    const byStatus = statusStats.reduce(
      (acc, s) => { acc[s.status] = s._count.id; return acc; },
      {} as Record<string, number>,
    );

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);

    return {
      total,
      new: byStatus['NEW'] || 0,
      byStatus,
      byPriority: priorityStats.reduce(
        (acc, s) => { acc[s.priority] = s._count.id; return acc; },
        {} as Record<string, number>,
      ),
    };
  }
}
