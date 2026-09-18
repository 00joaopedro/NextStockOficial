import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { LOCAL_PASSWORD_MAX_LENGTH, LOCAL_PASSWORD_MIN_LENGTH } from '../../auth/local-password';

export class CreateTenantUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(LOCAL_PASSWORD_MIN_LENGTH)
  @MaxLength(LOCAL_PASSWORD_MAX_LENGTH)
  password!: string;

  @IsOptional()
  @IsIn([Role.Admin, Role.Vendedor, Role.Comprador])
  role?: Role;
}
