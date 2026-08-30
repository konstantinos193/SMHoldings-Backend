import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum PropertyStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  MAINTENANCE = 'MAINTENANCE',
  SUSPENDED = 'SUSPENDED',
}

export enum PropertyType {
  APARTMENT = 'APARTMENT',
  HOUSE = 'HOUSE',
  ROOM = 'ROOM',
  COMMERCIAL = 'COMMERCIAL',
  STORAGE = 'STORAGE',
  PLOT = 'PLOT',
  GARAGE = 'GARAGE',
  LUXURY = 'LUXURY',
  INVESTMENT = 'INVESTMENT',
}

export class CreatePropertyDto {
  @ApiProperty({ example: 'Ξενοδοχείο Αθήνα' })
  @IsString()
  titleGr: string;

  @ApiProperty({ example: 'Athens Hotel' })
  @IsString()
  titleEn: string;

  @ApiPropertyOptional({ example: 'Καταπληκτικό ξενοδοχείο' })
  @IsOptional()
  @IsString()
  descriptionGr?: string;

  @ApiPropertyOptional({ example: 'Amazing hotel' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiProperty({ enum: PropertyType })
  @IsEnum(PropertyType)
  type: PropertyType;

  @ApiProperty({ example: 'Syntagma Square 1' })
  @IsString()
  address: string;

  @ApiProperty({ example: 'Athens' })
  @IsString()
  city: string;

  @ApiProperty({ example: 'Greece' })
  @IsString()
  country: string;

  @ApiPropertyOptional({ example: 37.9755 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 23.7348 })
  @IsOptional()
  @IsNumber()
  longitude?: number;

  @ApiProperty({ example: 4, minimum: 1 })
  @IsNumber()
  @Min(1)
  maxGuests: number;

  @ApiProperty({ example: 2, minimum: 0 })
  @IsNumber()
  @Min(0)
  bedrooms: number;

  @ApiProperty({ example: 1, minimum: 0 })
  @IsNumber()
  @Min(0)
  bathrooms: number;

  @ApiPropertyOptional({ example: 75.5 })
  @IsOptional()
  @IsNumber()
  area?: number;

  @ApiProperty({ example: 120.0, minimum: 0 })
  @IsNumber()
  @Min(0)
  basePrice: number;

  @ApiPropertyOptional({ example: 'EUR', default: 'EUR' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 25.0 })
  @IsOptional()
  @IsNumber()
  cleaningFee?: number;

  @ApiPropertyOptional({ example: 15.0 })
  @IsOptional()
  @IsNumber()
  serviceFee?: number;

  @ApiPropertyOptional({ example: 8.0 })
  @IsOptional()
  @IsNumber()
  taxes?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsNumber()
  minStay?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  maxStay?: number;

  @ApiPropertyOptional({ example: 30, default: 30 })
  @IsOptional()
  @IsNumber()
  advanceBooking?: number;

  @ApiPropertyOptional({ example: '15:00' })
  @IsOptional()
  @IsString()
  checkInTime?: string;

  @ApiPropertyOptional({ example: '11:00' })
  @IsOptional()
  @IsString()
  checkOutTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  houseRules?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  petFriendly?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  smokingAllowed?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  partyAllowed?: boolean;

  @ApiPropertyOptional({ type: [String], example: ['https://example.com/image.jpg'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  videos?: string[];

  @ApiPropertyOptional({ type: [String], example: ['wifi', 'parking'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ example: '10431' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 10, default: 10, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  serviceFeePercentage?: number;

  @ApiPropertyOptional({ example: 24, default: 24, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @ApiPropertyOptional({ enum: ['FLEXIBLE', 'MODERATE', 'STRICT', 'SUPER_STRICT'], default: 'MODERATE' })
  @IsOptional()
  @IsEnum(['FLEXIBLE', 'MODERATE', 'STRICT', 'SUPER_STRICT'])
  cancellationPolicy?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasDynamicRooms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  propertyGroupId?: string;

  /**
   * UpdatePropertyDto is a PartialType of this class, so without `status` here
   * the global forbidNonWhitelisted pipe rejected any attempt to change a
   * property's status — it could be displayed but never set.
   */
  @ApiPropertyOptional({ enum: PropertyStatus, default: PropertyStatus.ACTIVE })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;
}

