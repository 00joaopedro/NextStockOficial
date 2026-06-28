import { IsBoolean } from 'class-validator';

export class UpdateReferralSeenDto {
  @IsBoolean()
  seen!: boolean;
}
