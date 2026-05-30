import { IsIn, IsOptional, IsString } from 'class-validator';

export type DevPeriod = 'day' | 'today' | 'week' | 'weekly' | 'month' | 'monthly';

export class DevQueryDto {
  @IsOptional()
  @IsIn(['day', 'today', 'week', 'weekly', 'month', 'monthly'])
  period?: DevPeriod = 'day';

  @IsOptional()
  @IsString()
  search?: string;
}
