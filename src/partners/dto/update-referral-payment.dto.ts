import { PartnerPaymentStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateReferralPaymentDto {
  @IsEnum(PartnerPaymentStatus)
  paymentStatus!: PartnerPaymentStatus;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason?: string;
}
