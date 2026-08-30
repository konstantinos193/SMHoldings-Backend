import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

/**
 * Typing the @Query() parameter as an intersection (`PaginationDto & { source?: string }`)
 * makes TypeScript emit `Object` as the metatype, so the global ValidationPipe skips it:
 * no @Type(() => Number) transform and no defaults, leaving page/limit as raw strings.
 * Prisma then rejects `take: "20"` and the request 500s. A real class keeps validation on.
 */
export class QueryExternalBookingsDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['BOOKING_COM', 'AIRBNB', 'VRBO', 'EXPEDIA', 'MANUAL', 'OTHER'],
  })
  @IsOptional()
  @IsString()
  source?: string;
}
