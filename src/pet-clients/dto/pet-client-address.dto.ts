import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PetClientAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bairro?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  rua?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  cep?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  bloco?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  numeroCasa?: string;
}
