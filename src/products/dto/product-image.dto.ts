import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductImageMetadataDto {
  @IsString()
  @MaxLength(180)
  fileName!: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  storagePath?: string;
}

export class CreateProductImagesDto {
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => ProductImageMetadataDto)
  images!: ProductImageMetadataDto[];
}
