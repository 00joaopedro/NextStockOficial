import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderPaymentMethod, OrderStatus } from '@prisma/client';

export class CreateOrderItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(9999)
  quantity!: number;
}

export class CreateOrderDto {
  @IsString()
  @MaxLength(160)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  customerEmail?: string;

  @IsOptional()
  @IsEnum(OrderPaymentMethod)
  paymentMethod?: OrderPaymentMethod;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  discountCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}
