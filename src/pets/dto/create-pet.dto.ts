import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePetDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  species?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  breed?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  ageText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  weight?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  height?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  width?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  length?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  foodPerDay?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  vaccinesTaken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  vaccinesPending?: string;
}
