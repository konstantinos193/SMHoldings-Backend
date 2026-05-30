import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { MessageQueryDto } from './dto/message-query.dto';
import { getPagination } from '../common/utils/pagination.util';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: MessageQueryDto) {
    const { page = 1, limit = 10, bookingId, isRead, sortBy = 'createdAt', sortOrder = 'desc' } = query;
    const skip = (page - 1) * limit;

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const where: any = {};

    if (bookingId) {
      where.bookingId = bookingId;
    }

    if (isRead !== undefined) {
      where.isRead = isRead;
    }

    const [messages, total] = await Promise.all([
      this.prisma.message.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          sender: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
          booking: {
            select: {
              id: true,
              propertyId: true,
              guestName: true,
              checkIn: true,
              checkOut: true,
              property: {
                select: {
                  titleEn: true,
                  titleGr: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    return {
      success: true,
      data: {
        messages,
        pagination: getPagination(page, limit, total),
      },
    };
  }

  async findByBooking(bookingId: string) {
    const messages = await this.prisma.message.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
      take: 200,
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return {
      success: true,
      data: { messages },
    };
  }

  async findOne(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        booking: {
          select: {
            id: true,
            propertyId: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            property: {
              select: {
                titleEn: true,
                titleGr: true,
              },
            },
          },
        },
      },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return {
      success: true,
      data: message,
    };
  }

  async create(createMessageDto: CreateMessageDto) {
    const { bookingId, content, type = 'TEXT', senderId } = createMessageDto;

    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const message = await this.prisma.message.create({
      data: {
        bookingId,
        senderId,
        content,
        type,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        booking: {
          select: {
            id: true,
            propertyId: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            property: {
              select: {
                titleEn: true,
                titleGr: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: message,
    };
  }

  async markAsRead(id: string) {
    const updatedMessage = await this.prisma.message.update({
      where: { id },
      data: { isRead: true },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        booking: {
          select: {
            id: true,
            propertyId: true,
            guestName: true,
            checkIn: true,
            checkOut: true,
            property: {
              select: {
                titleEn: true,
                titleGr: true,
              },
            },
          },
        },
      },
    });

    return {
      success: true,
      data: updatedMessage,
    };
  }

  async remove(id: string) {
    const message = await this.prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    await this.prisma.message.delete({
      where: { id },
    });

    return {
      success: true,
      message: 'Message deleted successfully',
    };
  }

  async getUnreadCount(userId?: string) {
    const where: any = { isRead: false };

    if (userId) {
      // Count unread messages where user is not the sender
      where.senderId = { not: userId };
    }

    const count = await this.prisma.message.count({ where });

    return {
      success: true,
      data: { count },
    };
  }
}
