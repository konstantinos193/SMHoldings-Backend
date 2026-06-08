import { IsOptional, IsEnum, IsString, IsNumber, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus, PaymentStatus } from './create-booking.dto';

export class UpdateBookingDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialRequests?: string;

  @ApiPropertyOptional({ example: 1170, description: 'Auto-calculated base price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  basePrice?: number;

  @ApiPropertyOptional({ example: 1170, description: 'Agreed total price (may include discount)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  totalPrice?: number;
}

