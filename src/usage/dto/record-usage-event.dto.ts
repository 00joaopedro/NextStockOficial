import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RecordUsageEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  eventType?: string;
}
