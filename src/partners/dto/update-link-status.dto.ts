import { PartnerLinkStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateLinkStatusDto {
  @IsEnum(PartnerLinkStatus)
  status!: PartnerLinkStatus;
}
