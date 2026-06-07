import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AgendaPetStatus } from '@prisma/client';

export class CreateAgendaPetDto {
  @IsString()
  @IsNotEmpty()
  cliente: string;

  @IsString()
  @IsNotEmpty()
  animal: string;

  @IsString()
  @IsNotEmpty()
  atendente: string;

  @IsString()
  @IsNotEmpty()
  servico: string;

  // ISO date string (YYYY-MM-DD or full ISO)
  @IsDateString()
  @IsNotEmpty()
  data: string;

  @IsString()
  @IsNotEmpty()
  hora: string;

  @IsNumber()
  @IsNotEmpty()
  preco: number;

  @IsString()
  @IsOptional()
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
