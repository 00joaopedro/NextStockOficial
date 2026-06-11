import { IsEnum } from 'class-validator';
import { SupplierStatus } from '@prisma/client';

export class UpdateSupplierStatusDto {
  @IsEnum(SupplierStatus)
  status!: SupplierStatus;
}
