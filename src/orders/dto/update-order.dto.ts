import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderPaymentMethod, OrderStatus } from '@prisma/client';
import { CreateOrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  customerName?: string;

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items?: CreateOrderItemDto[];
}
