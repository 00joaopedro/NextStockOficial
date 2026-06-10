import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EmployeeRole, EmployeeStatus } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  fullName?: string;

  @IsOptional()
  @IsEnum(EmployeeRole)
  employeeRole?: EmployeeRole;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  birthDate?: string | null;

  @IsOptional()
  @IsDateString()
  admissionDate?: string | null;

  @IsOptional()
  @IsDateString()
  dismissalDate?: string | null;
}
