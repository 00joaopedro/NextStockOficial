import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { SaleDocumentStatus } from '@prisma/client';

export class FiscalDocumentQueryDto {
  @IsOptional()
  @IsEnum(SaleDocumentStatus)
  status?: SaleDocumentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
