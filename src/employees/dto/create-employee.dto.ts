import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { EmployeeRole } from '@prisma/client';
import { LOCAL_PASSWORD_MAX_LENGTH, LOCAL_PASSWORD_MIN_LENGTH } from '../../auth/local-password';

export class CreateEmployeeDto {
  @IsString()
  @MaxLength(160)
  fullName!: string;

  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsString()
  @MinLength(LOCAL_PASSWORD_MIN_LENGTH)
  @MaxLength(LOCAL_PASSWORD_MAX_LENGTH)
  password!: string;

  @IsEnum(EmployeeRole)
  employeeRole!: EmployeeRole;

  @IsString()
  @MaxLength(120)
  jobTitle!: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsDateString()
  admissionDate?: string;

  @IsOptional()
  @IsDateString()
  dismissalDate?: string;
}
