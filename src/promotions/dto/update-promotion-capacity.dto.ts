import { IsDefined, IsInt, IsString, Max, Min } from 'class-validator';

export class UpdatePromotionCapacityDto {
  @IsDefined()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxConversions!: number;

  @IsDefined()
  @IsString()
  confirmation!: string;
}
