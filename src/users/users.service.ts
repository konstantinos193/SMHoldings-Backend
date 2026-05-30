import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { getPagination } from '../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: PaginationDto) {
    const { page = 1, limit = 10, sortBy, sortOrder = 'desc' } = query;

    const sort: any = {};
    if (sortBy) {
      sort[sortBy] = sortOrder;
    } else {
      sort.createdAt = 'desc';
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: sort,
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          avatar: true,
          isActive: true,
          mfaEnabled: true,
          emailVerified: true,
          phoneVerified: true,
          stripeAccountId: true,
          stripeAccountStatus: true,
          preferredCurrency: true,
          preferredLanguage: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              properties: true,
              bookings: true,
              reviews: true,
            },
          },
        },
      }),
      this.prisma.user.count(),
    ]);

    return {
      success: true,
      data: {
        users,
        pagination: getPagination(page, limit, total),
      },
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatar: true,
        isActive: true,
        mfaEnabled: true,
        emailVerified: true,
        phoneVerified: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        preferredCurrency: true,
        preferredLanguage: true,
        createdAt: true,
        updatedAt: true,
        properties: {
          select: {
            id: true,
            titleGr: true,
            titleEn: true,
            type: true,
            status: true,
            basePrice: true,
            images: true,
            city: true,
          },
          take: 10,
        },
        bookings: {
          select: {
            id: true,
            status: true,
            checkIn: true,
            checkOut: true,
            totalPrice: true,
            property: {
              select: {
                id: true,
                titleGr: true,
                titleEn: true,
                city: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: {
            properties: true,
            bookings: true,
            reviews: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      success: true,
      data: user,
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      success: true,
      message: 'User updated successfully',
      data: user,
    };
  }

  async activate(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });

    return {
      success: true,
      message: 'User activated successfully',
    };
  }

  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    return {
      success: true,
      message: 'User deactivated successfully',
    };
  }
}
