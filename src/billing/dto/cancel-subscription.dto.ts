import { IsBoolean, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsOptional()
  @IsBoolean()
  immediate = true;
}
