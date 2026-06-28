import { IsUUID } from 'class-validator';

export class SyncBillingDto {
  @IsUUID()
  checkoutId!: string;
}
