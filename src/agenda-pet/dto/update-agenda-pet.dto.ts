import { IsNotEmpty, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

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

	@IsString()
	@IsOptional()
	tenantId?: string;
}
