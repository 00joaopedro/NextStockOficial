import { IsEnum } from 'class-validator';
import { SystemMode } from '@prisma/client';

export class UpdateModeDto {
  @IsEnum(SystemMode)
  mode!: SystemMode;
}
