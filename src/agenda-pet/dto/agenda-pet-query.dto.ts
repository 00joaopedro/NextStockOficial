import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { AgendaPetStatus } from '@prisma/client';

export class AgendaPetQueryDto {
  @IsDateString()
  @IsOptional()
  startAtFrom?: string;

  @IsDateString()
  @IsOptional()
  startAtTo?: string;

  @IsEnum(AgendaPetStatus)
  @IsOptional()
  status?: AgendaPetStatus;

  @IsUUID()
  @IsOptional()
  clientId?: string;

  @IsUUID()
  @IsOptional()
  petId?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;
}
