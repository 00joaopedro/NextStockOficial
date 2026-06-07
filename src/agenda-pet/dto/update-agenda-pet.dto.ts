import {
	IsDateString,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
} from 'class-validator';
import { AgendaPetStatus } from '@prisma/client';

export class UpdateAgendaPetDto {
	@IsString()
	@IsOptional()
	cliente?: string;

	@IsString()
	@IsOptional()
	animal?: string;

	@IsString()
	@IsOptional()
	atendente?: string;

	@IsString()
	@IsOptional()
	servico?: string;

	@IsDateString()
	@IsOptional()
	data?: string;

	@IsString()
	@IsOptional()
	hora?: string;

	@IsNumber()
	@IsOptional()
	preco?: number;

	@IsString()
	@IsOptional()
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
