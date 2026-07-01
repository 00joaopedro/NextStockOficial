import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { FiscalEnvironment } from '@prisma/client';

export class CompanyFiscalConfigDto {
  @IsString()
  @MaxLength(180)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  tradeName?: string;

  @IsString()
  @MaxLength(20)
  cnpj!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  stateRegistration?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  municipalRegistration?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  crt!: number;

  @IsString()
  @MaxLength(60)
  taxRegime!: string;

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

  @IsOptional()
  @IsEnum(FiscalEnvironment)
  environment?: FiscalEnvironment;

  @IsString()
  @MaxLength(10)
  nfeSeries!: string;

  @IsString()
  @MaxLength(10)
  nfceSeries!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  provider?: string;

  @IsOptional()
  @IsObject()
  providerConfig?: Record<string, unknown>;
}
