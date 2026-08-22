import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { StorefrontStatus } from '@prisma/client';

export class UpsertStorefrontDto {
  @IsUUID() branchId!: string;
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(63)
  publicSlug!: string;
  @IsString() @MaxLength(120) publicName!: string;
  @IsOptional() @IsString() @MaxLength(1000) publicDescription?: string;
  @IsEnum(StorefrontStatus) status!: StorefrontStatus;
  @IsBoolean() orderingEnabled!: boolean;
  @IsBoolean() pickupEnabled!: boolean;
  @IsBoolean() deliveryEnabled!: boolean;
}

export class UpdateStorefrontProductDto {
  @IsUUID() productId!: string;
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  publicSlug!: string;
  @IsBoolean() isPublished!: boolean;
  @IsBoolean() availableForOnlineOrder!: boolean;
  @IsOptional() @IsString() @MaxLength(120) publicName?: string;
  @IsOptional() @IsString() @MaxLength(2000) publicDescription?: string;
  @Type(() => Number) @IsInt() @Min(-10000) @Max(10000) sortOrder!: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(9999) minimumOrderQuantity!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  maximumOrderQuantity?: number;
}
