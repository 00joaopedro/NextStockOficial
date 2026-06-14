import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MachineStatus, PaymentProvider } from '@prisma/client';

export class CreatePaymentMachineDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(PaymentProvider)
  provider!: PaymentProvider;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  model!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  feePercent!: number;

  @IsOptional()
  @IsEnum(MachineStatus)
  status?: MachineStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  externalProvider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  externalReference?: string;
}
