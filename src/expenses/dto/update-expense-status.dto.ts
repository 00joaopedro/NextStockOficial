import { IsEnum } from 'class-validator';
import { ExpenseStatus } from '@prisma/client';

export class UpdateExpenseStatusDto {
  @IsEnum(ExpenseStatus)
  status!: ExpenseStatus;
}
