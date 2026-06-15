import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { normalizeScanCode } from '../scan-code.util';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeScanCode(value))
  @IsString()
  @MaxLength(512)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
