import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(createReviewDto: CreateReviewDto, userId: string) {
    // Verify booking exists and belongs to user
    const booking = await this.prisma.booking.findUnique({
      where: { id: createReviewDto.bookingId },
      include: { property: true },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    if (booking.guestId !== userId) {
      throw new ForbiddenException('You can only review your own bookings');
    }

    // Check if review already exists for this booking
    const existingReview = await this.prisma.review.findUnique({
      where: { bookingId: createReviewDto.bookingId },
    });

    if (existingReview) {
      throw new BadRequestException('Review already exists for this booking');
    }

    // Verify booking is completed
    if (booking.status !== 'COMPLETED') {
      throw new BadRequestException('Can only review completed bookings');
    }

    // Create review
    const review = await this.prisma.review.create({
      data: {
        ...createReviewDto,
        guestId: userId,
        isPublic: createReviewDto.isPublic ?? true,
      },
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        property: {
          select: {
            id: true,
            titleEn: true,
            titleGr: true,
          },
        },
      },
    });

    // Update property's average cleanliness rating
    await this.updatePropertyCleanlinessRating(createReviewDto.propertyId);

    return review;
  }

  async findAll(propertyId?: string, page = 1, limit = 20) {
    const pageNum = +page;
    const limitNum = +limit;
    const where: any = { isPublic: true };
    if (propertyId) {
      where.propertyId = propertyId;
    }

    const [reviews, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          guest: { select: { id: true, name: true, avatar: true } },
          property: { select: { id: true, titleEn: true, titleGr: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      this.prisma.review.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limitNum);
    return {
      success: true,
      data: {
        reviews,
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

  async findOne(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        property: {
          select: {
            id: true,
            titleEn: true,
            titleGr: true,
          },
        },
        booking: {
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
          },
        },
      },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    return review;
  }

  async update(id: string, updateReviewDto: UpdateReviewDto, userId: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    // Only guest can update their review, or property owner can add response
    const isGuest = review.guestId === userId;
    const isOwner = review.property.ownerId === userId;

    if (!isGuest && !isOwner) {
      throw new ForbiddenException('Unauthorized to update this review');
    }

    // Guests can only update their own review (not response)
    if (isGuest && updateReviewDto.response) {
      throw new ForbiddenException('Guests cannot add host responses');
    }

    // Owners can only add responses
    if (isOwner && updateReviewDto.response) {
      return this.prisma.review.update({
        where: { id },
        data: { response: updateReviewDto.response },
        include: {
          guest: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
      });
    }

    // Guest updating their review
    const updateData: any = { ...updateReviewDto };
    delete updateData.response; // Remove response from guest updates

    const updatedReview = await this.prisma.review.update({
      where: { id },
      data: updateData,
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    // Update property cleanliness rating if cleanliness rating changed
    if (updateReviewDto.cleanlinessRating !== undefined) {
      await this.updatePropertyCleanlinessRating(review.propertyId);
    }

    return updatedReview;
  }

  async remove(id: string, userId: string, userRole?: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!review) {
      throw new NotFoundException('Review not found');
    }

    const isGuest = review.guestId === userId;
    const isAdmin = userRole === 'ADMIN';

    if (!isGuest && !isAdmin) {
      throw new ForbiddenException('Unauthorized to delete this review');
    }

    const propertyId = review.propertyId;

    await this.prisma.review.delete({
      where: { id },
    });

    // Update property cleanliness rating
    await this.updatePropertyCleanlinessRating(propertyId);

    return { message: 'Review deleted successfully' };
  }

  async getPropertyReviews(propertyId: string) {
    const reviews = await this.prisma.review.findMany({
      where: {
        propertyId,
        isPublic: true,
      },
      include: {
        guest: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate average ratings
    const totalReviews = reviews.length;
    const averageRating =
      totalReviews > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        : 0;

    const averageCleanlinessRating =
      totalReviews > 0
        ? reviews
            .filter((r) => r.cleanlinessRating)
            .reduce((sum, r) => sum + (r.cleanlinessRating || 0), 0) /
          reviews.filter((r) => r.cleanlinessRating).length
        : 0;

    return {
      reviews,
      summary: {
        totalReviews,
        averageRating: Math.round(averageRating * 100) / 100,
        averageCleanlinessRating:
          Math.round(averageCleanlinessRating * 100) / 100,
        ratingDistribution: this.calculateRatingDistribution(reviews),
      },
    };
  }

  private async updatePropertyCleanlinessRating(propertyId: string): Promise<void> {
    const reviews = await this.prisma.review.findMany({
      where: {
        propertyId,
        cleanlinessRating: { not: null },
      },
      select: {
        cleanlinessRating: true,
      },
    });

    if (reviews.length === 0) {
      return;
    }

    const averageCleanliness =
      reviews.reduce(
        (sum, r) => sum + (r.cleanlinessRating || 0),
        0,
      ) / reviews.length;

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        averageCleanlinessRating: Math.round(averageCleanliness * 100) / 100,
      },
    });
  }

  private calculateRatingDistribution(reviews: any[]): Record<number, number> {
    const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    reviews.forEach((review) => {
      distribution[review.rating] = (distribution[review.rating] || 0) + 1;
    });
    return distribution;
  }
}

