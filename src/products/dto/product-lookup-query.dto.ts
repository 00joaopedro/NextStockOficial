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

export class ProductLookupQueryDto {
  @IsOptional()
  @Transform(({ value }) => normalizeScanCode(value))
  @IsString()
  @MaxLength(512, {
    message: 'barcode deve ter no maximo 512 caracteres.',
  })
  barcode?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeScanCode(value))
  @IsString()
  @MaxLength(512, {
    message: 'code deve ter no maximo 512 caracteres.',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number = 10;
}
