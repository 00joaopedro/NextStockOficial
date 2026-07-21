import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { FulfillmentType } from '@prisma/client';

export class PublicProductsQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(80) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(40) limit?: number;
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
}
class GuestOrderItemDto {
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  productSlug!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(9999) quantity!: number;
}
class DeliveryAddressDto {
  @IsString() @MaxLength(12) postalCode!: string;
  @IsString() @MaxLength(120) street!: string;
  @IsString() @MaxLength(20) number!: string;
  @IsOptional() @IsString() @MaxLength(80) complement?: string;
  @IsString() @MaxLength(80) neighborhood!: string;
  @IsString() @MaxLength(80) city!: string;
  @IsString() @Matches(/^[A-Za-z]{2}$/) state!: string;
}
export class CreateGuestOrderDto {
  @IsString() @MaxLength(120) customerName!: string;
  @IsString() @Matches(/^\+?[0-9 ()-]{8,24}$/) customerPhone!: string;
  @IsOptional() @IsEmail() @MaxLength(160) customerEmail?: string;
  @IsEnum(FulfillmentType) fulfillmentType!: FulfillmentType;
  @ValidateIf(
    (value: CreateGuestOrderDto) =>
      value.fulfillmentType === FulfillmentType.delivery,
  )
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => GuestOrderItemDto)
  items!: GuestOrderItemDto[];
}
