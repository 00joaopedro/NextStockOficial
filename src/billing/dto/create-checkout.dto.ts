import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/)
  planSlug!: string;

  @IsOptional()
  @IsUUID()
  promotionReservationId?: string;
}
