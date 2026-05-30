import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type DevUsagePeriod = 'day' | 'today' | 'week' | 'weekly' | 'month' | 'monthly';

export class DevUsageQueryDto {
  @IsOptional()
  @IsIn(['day', 'today', 'week', 'weekly', 'month', 'monthly'])
  period?: DevUsagePeriod = 'day';

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize?: number;
}
