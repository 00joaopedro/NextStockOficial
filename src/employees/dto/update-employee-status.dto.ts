import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { EmployeeStatus } from '@prisma/client';

export class UpdateEmployeeStatusDto {
  @IsEnum(EmployeeStatus)
  status!: EmployeeStatus;

  @IsOptional()
  @IsDateString()
  dismissalDate?: string;
}
