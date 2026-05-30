import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateRoomAvailabilityDto {
  @IsBoolean()
  isAvailable: boolean;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
