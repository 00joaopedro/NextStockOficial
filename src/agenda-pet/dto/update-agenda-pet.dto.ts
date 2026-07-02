import {
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
import { AgendaPetStatus } from '@prisma/client';

export class UpdateAgendaPetDto {
	@IsString()
	@IsOptional()
	@MaxLength(120)
	cliente?: string;

	@IsString()
	@IsOptional()
	@MaxLength(120)
	animal?: string;

	@IsString()
	@IsOptional()
	@MaxLength(120)
	atendente?: string;

	@IsString()
	@IsOptional()
	@MaxLength(160)
	servico?: string;

	@IsDateString()
	@IsOptional()
	data?: string;

	@IsString()
	@IsOptional()
	@MaxLength(8)
	hora?: string;

	@IsNumber()
	@Min(0)
	@Max(1_000_000)
	@IsOptional()
	preco?: number;

	@IsString()
	@IsOptional()
	@MaxLength(1000)
	descricao?: string;

	@IsUUID()
	@IsOptional()
	clientId?: string;

	@IsUUID()
	@IsOptional()
	petId?: string;

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

	@IsString()
	@MaxLength(500)
	@IsOptional()
	cancellationReason?: string;
}
