import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  companyName!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(200)
  password!: string;

  @IsString()
  @IsIn(['padrao', 'petshop'])
  @MaxLength(20)
  systemType!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{32,128}$/)
  referralCode?: string;
}
