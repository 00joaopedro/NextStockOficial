import { IsNotEmpty, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

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

  @IsString()
  @IsOptional()
  tenantId?: string;
}
