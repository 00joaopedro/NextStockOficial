import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { OrderPaymentMethod, SaleDocumentType } from '@prisma/client';

export class CreateSaleFromOrderDto {
  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @IsOptional()
  @IsUUID()
  paymentMachineId?: string;

  @IsOptional()
  @IsEnum(SaleDocumentType)
  documentType?: SaleDocumentType;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  amountCents?: number;
}
