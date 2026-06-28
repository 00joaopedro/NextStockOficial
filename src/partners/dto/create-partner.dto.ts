import { SystemType } from '@prisma/client';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreatePartnerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^\+?[0-9()\-\s]{10,24}$/)
  phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  bankNumber!: string;

  @IsEnum(SystemType)
  systemType!: SystemType;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
