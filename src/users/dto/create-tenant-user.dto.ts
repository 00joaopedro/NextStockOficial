import { Role } from '@prisma/client';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTenantUserDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn([Role.Admin, Role.Vendedor, Role.Comprador])
  role?: Role;
}
