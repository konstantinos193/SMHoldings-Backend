import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  Min,
} from 'class-validator';
import { RoomType, RoomCategory } from '../../database/types';

export class CreateRoomDto {
  @IsString()
  propertyId: string;

  @IsString()
  name: string;

  /**
   * Optional override for the public URL segment. Left unset, one is derived
   * from the name (`Apartment 03 – First Floor` -> `apartment-03-first-floor`).
   * Whatever is supplied is normalised and de-duplicated before it is stored.
   */
  @IsString()
  @IsOptional()
  slug?: string;

  @IsString()
  @IsOptional()
  nameGr?: string;

  @IsString()
  @IsOptional()
  nameEn?: string;

  @IsEnum(RoomType)
  type: RoomType;

  @IsEnum(RoomCategory)
  @IsOptional()
  category?: RoomCategory;

  @IsNumber()
  @Min(1)
  capacity: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxAdults?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxChildren?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  maxInfants?: number;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsBoolean()
  @IsOptional()
  isBookable?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  amenities?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @IsString()
  @IsOptional()
  descriptionGr?: string;

  @IsString()
  @IsOptional()
  descriptionEn?: string;
}

