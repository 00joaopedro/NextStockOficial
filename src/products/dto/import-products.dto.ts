import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const PRODUCT_IMPORT_BATCH_SIZE = 200;

class ImportProductRowDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  barcode?: string | null;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  costPriceCents!: number;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  salePriceCents!: number;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  quantity!: number;
}

export class ImportProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(PRODUCT_IMPORT_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => ImportProductRowDto)
  items!: ImportProductRowDto[];
}
