import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserWithRole } from '../common/decorators/current-user-with-role.decorator';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  findAll(
    @Query('propertyId') propertyId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.reviewsService.findAll(propertyId, page, limit);
  }

  @Get('property/:propertyId')
  getPropertyReviews(@Param('propertyId') propertyId: string) {
    return this.reviewsService.getPropertyReviews(propertyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reviewsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() createReviewDto: CreateReviewDto,
    @CurrentUser() userId: string,
  ) {
    return this.reviewsService.create(createReviewDto, userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Param('id') id: string,
    @Body() updateReviewDto: UpdateReviewDto,
    @CurrentUser() userId: string,
  ) {
    return this.reviewsService.update(id, updateReviewDto, userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUserWithRole() user: any) {
    return this.reviewsService.remove(id, user?.userId ?? user?.id, user?.role);
  }
}

