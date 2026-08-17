import { IsString, IsNumber, IsEmail, IsOptional, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CHECKED_IN = 'CHECKED_IN',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
}

export enum BookingSource {
  DIRECT = 'DIRECT',
  BOOKING_COM = 'BOOKING_COM',
  AIRBNB = 'AIRBNB',
  VRBO = 'VRBO',
  EXPEDIA = 'EXPEDIA',
  MANUAL = 'MANUAL',
  OTHER = 'OTHER',
}

export class CreateBookingDto {
  @ApiProperty({ example: 'property-id-123' })
  @IsString()
  propertyId: string;

  @ApiProperty({ example: '2024-06-01T00:00:00Z' })
  @IsString()
  checkIn: string;

  @ApiProperty({ example: '2024-06-10T00:00:00Z' })
  @IsString()
  checkOut: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsNumber()
  @Min(1)
  guests: number;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  guestName: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  guestEmail: string;

  @ApiPropertyOptional({ example: '+30 210 123 4567' })
  @IsOptional()
  @IsString()
  guestPhone?: string;

  @ApiPropertyOptional({ example: 'Late check-in please' })
  @IsOptional()
  @IsString()
  specialRequests?: string;

  @ApiPropertyOptional({ example: 'room-id-123' })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({ example: 'Deluxe Suite' })
  @IsOptional()
  @IsString()
  roomName?: string;

  @ApiPropertyOptional({ example: 'credit_card' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ enum: BookingStatus, example: BookingStatus.PENDING })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

