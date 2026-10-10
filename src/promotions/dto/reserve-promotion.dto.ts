import { IsDefined, IsIn, IsInt, IsString } from 'class-validator';

export const PROMOTION_PLAN_SLUGS = ['ouro', 'esmeralda'] as const;
export const PROMOTION_PERIODS = [1, 3, 6] as const;

export class ReservePromotionDto {
  @IsDefined()
  @IsString()
  @IsIn([...PROMOTION_PLAN_SLUGS])
  planSlug!: (typeof PROMOTION_PLAN_SLUGS)[number];

  @IsDefined()
  @IsInt()
  @IsIn([...PROMOTION_PERIODS])
  periodMonths!: (typeof PROMOTION_PERIODS)[number];
}
