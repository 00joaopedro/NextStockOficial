import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProductLookupQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
