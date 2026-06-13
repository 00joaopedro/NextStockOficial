import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FiscalRecipientDto {
  @IsString()
  @MaxLength(180)
  name!: string;

  @IsIn(['cpf', 'cnpj', 'estrangeiro'])
  documentType!: 'cpf' | 'cnpj' | 'estrangeiro';

  @IsString()
  @MaxLength(30)
  document!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string;

  @IsIn(['1', '2', '9'])
  ieIndicator!: '1' | '2' | '9';

  @IsOptional()
  @IsString()
  @MaxLength(180)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MaxLength(180)
  street!: string;

  @IsString()
  @MaxLength(30)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  complement?: string;

  @IsString()
  @MaxLength(100)
  district!: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(10)
  cityCodeIbge!: string;

  @IsString()
  @MaxLength(2)
  state!: string;

  @IsString()
  @MaxLength(12)
  zipCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;
}

export class CreateNfe55DocumentDto {
  @IsUUID()
  saleId!: string;

  @IsUUID()
  idempotencyKey!: string;

  @ValidateNested()
  @Type(() => FiscalRecipientDto)
  recipient!: FiscalRecipientDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationNature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  buyerPresence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  finalConsumer?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  freightCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInformation?: string;
}
