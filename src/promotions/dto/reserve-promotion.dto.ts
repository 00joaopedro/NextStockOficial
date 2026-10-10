import { IsIn, IsInt, IsOptional, IsString, Matches } from 'class-validator';

export class ReservePromotionDto {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{1,80}$/)
  planSlug?: string;

  @IsOptional()
  @IsInt()
  @IsIn([8, 12, 24])
  periodMonths?: number;
}
