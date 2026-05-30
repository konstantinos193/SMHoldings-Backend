import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePropertyGroupDto } from './dto/create-property-group.dto';
import { UpdatePropertyGroupDto } from './dto/update-property-group.dto';

@Injectable()
export class PropertyGroupsService {
  constructor(private prisma: PrismaService) {}

  async create(createPropertyGroupDto: CreatePropertyGroupDto, userId: string) {
    return this.prisma.propertyGroup.create({
      data: {
        ...createPropertyGroupDto,
        ownerId: userId,
      },
      include: {
        properties: true,
      },
    });
  }

  async findAll(userId: string, userRole?: string, page = 1, limit = 20) {
    const pageNum = +page;
    const limitNum = +limit;

    const isAdmin = userRole === 'ADMIN' || userRole === 'MANAGER';
    const where = isAdmin ? {} : { ownerId: userId };

    const [groups, total] = await Promise.all([
      this.prisma.propertyGroup.findMany({
        where,
        include: {
          properties: {
            select: { id: true, titleEn: true, titleGr: true, status: true, basePrice: true },
          },
          _count: { select: { properties: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.propertyGroup.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    return {
      success: true,
      data: {
        groups,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
        },
      },
    };
  }

  async findOne(id: string, userId: string) {
    const group = await this.prisma.propertyGroup.findUnique({
      where: { id },
      include: {
        properties: {
          include: {
            bookings: {
              where: {
                status: { in: ['CONFIRMED', 'CHECKED_IN'] },
              },
              select: {
                id: true,
                checkIn: true,
                checkOut: true,
                totalPrice: true,
              },
            },
            reviews: {
              select: {
                rating: true,
                cleanlinessRating: true,
              },
            },
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException('Property group not found');
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to view this property group');
    }

    return group;
  }

  async update(
    id: string,
    updatePropertyGroupDto: UpdatePropertyGroupDto,
    userId: string,
  ) {
    const group = await this.prisma.propertyGroup.findUnique({
      where: { id },
    });

    if (!group) {
      throw new NotFoundException('Property group not found');
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to update this property group');
    }

    return this.prisma.propertyGroup.update({
      where: { id },
      data: updatePropertyGroupDto,
      include: { properties: true },
    });
  }

  async remove(id: string, userId: string) {
    const group = await this.prisma.propertyGroup.findUnique({
      where: { id },
      include: { properties: true },
    });

    if (!group) {
      throw new NotFoundException('Property group not found');
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to delete this property group');
    }

    // Remove property group reference from all properties
    await this.prisma.property.updateMany({
      where: { propertyGroupId: id },
      data: { propertyGroupId: null },
    });

    await this.prisma.propertyGroup.delete({
      where: { id },
    });

    return { message: 'Property group deleted successfully' };
  }

  async addPropertyToGroup(
    groupId: string,
    propertyId: string,
    userId: string,
  ) {
    const group = await this.prisma.propertyGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Property group not found');
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to modify this property group');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    if (property.ownerId !== userId) {
      throw new ForbiddenException('Property does not belong to you');
    }

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyGroupId: groupId },
    });
  }

  async removePropertyFromGroup(
    groupId: string,
    propertyId: string,
    userId: string,
  ) {
    const group = await this.prisma.propertyGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Property group not found');
    }

    if (group.ownerId !== userId) {
      throw new ForbiddenException('Unauthorized to modify this property group');
    }

    return this.prisma.property.update({
      where: { id: propertyId },
      data: { propertyGroupId: null },
    });
  }

  async getGroupAnalytics(groupId: string, userId: string) {
    const group = await this.findOne(groupId, userId);

    // Calculate aggregate analytics for all properties in group
    const properties = await this.prisma.property.findMany({
      where: { propertyGroupId: groupId },
      include: {
        bookings: {
          where: {
            status: { in: ['CONFIRMED', 'CHECKED_IN', 'COMPLETED'] },
          },
        },
        reviews: true,
        analytics: {
          orderBy: { periodStart: 'desc' },
          take: 1,
        },
      },
    });

    const totalRevenue = properties.reduce(
      (sum, prop) =>
        sum +
        prop.bookings.reduce((bookingSum, booking) => bookingSum + (booking.ownerRevenue || 0), 0),
      0,
    );

    const totalBookings = properties.reduce(
      (sum, prop) => sum + prop.bookings.length,
      0,
    );

    const averageRating =
      properties.reduce(
        (sum, prop) =>
          sum +
          prop.reviews.reduce((reviewSum, review) => reviewSum + review.rating, 0) /
            (prop.reviews.length || 1),
        0,
      ) / (properties.length || 1);

    return {
      groupId: group.id,
      groupName: group.name,
      totalProperties: properties.length,
      totalRevenue,
      totalBookings,
      averageRating: Math.round(averageRating * 100) / 100,
      properties: properties.map((prop) => ({
        id: prop.id,
        title: prop.titleEn,
        revenue: prop.bookings.reduce(
          (sum, booking) => sum + (booking.ownerRevenue || 0),
          0,
        ),
        bookings: prop.bookings.length,
        rating:
          prop.reviews.length > 0
            ? prop.reviews.reduce((sum, r) => sum + r.rating, 0) /
              prop.reviews.length
            : null,
      })),
    };
  }
}

