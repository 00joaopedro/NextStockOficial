import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
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
import { ExpenseStatus, ExpenseType } from '@prisma/client';

export class CreateExpenseItemDto {
  @IsString()
  @MaxLength(180)
  productName!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99999)
  units!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  totalCostCents!: number;

  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class CreateExpenseDto {
  @IsEnum(ExpenseType)
  type!: ExpenseType;

  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  totalCents!: number;

  @IsDateString()
  date!: string;

  @IsString()
  @MaxLength(160)
  employeeName!: string;

  @IsString()
  @MaxLength(180)
  storeName!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items?: CreateExpenseItemDto[];
}
