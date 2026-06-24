import { Transform } from 'class-transformer';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export type DashboardPreset =
  | 'today'
  | 'last7days'
  | 'currentMonth'
  | 'previousMonth'
  | 'custom';

export type DashboardStatusMode = 'confirmed' | 'forecast';

export class DashboardFilterDto {
  @IsOptional()
  @IsIn(['today', 'last7days', 'currentMonth', 'previousMonth', 'custom'])
  preset?: DashboardPreset = 'currentMonth';

  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @IsOptional()
  @IsIn(['confirmed', 'forecast'])
  statusMode?: DashboardStatusMode = 'confirmed';

  @IsOptional()
  @Transform(({ value }) => String(value ?? '').trim())
  @IsString()
  @MaxLength(64)
  productId?: string;
}
