import { IsOptional, IsUUID } from 'class-validator';

export class Nfe55DraftQueryDto {
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @IsOptional()
  @IsUUID()
  saleId?: string;
}
