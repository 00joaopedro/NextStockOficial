import { IsIn, IsOptional, IsString } from 'class-validator';

export type DevPeriod = 'today' | 'weekly' | 'monthly';

export class DevQueryDto {
  @IsOptional()
  @IsIn(['today', 'weekly', 'monthly'])
  period?: DevPeriod = 'today';

  @IsOptional()
  @IsString()
  search?: string;
}
