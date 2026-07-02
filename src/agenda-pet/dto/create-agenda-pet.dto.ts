import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AgendaPetStatus } from '@prisma/client';

export class CreateAgendaPetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  cliente: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  animal: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  atendente: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  servico: string;

  // ISO date string (YYYY-MM-DD or full ISO)
  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  hora: string;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  @IsNotEmpty()
  preco: number;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  descricao?: string;

  @IsUUID()
  @IsNotEmpty()
  clientId: string;

  @IsUUID()
  @IsNotEmpty()
  petId: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsEnum(AgendaPetStatus)
  @IsOptional()
  status?: AgendaPetStatus;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;
}
