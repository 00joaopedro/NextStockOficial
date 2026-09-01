import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { LOCAL_PASSWORD_MIN_LENGTH } from '../local-password';

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
  @MinLength(LOCAL_PASSWORD_MIN_LENGTH)
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'password must contain only letters and numbers',
  })
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
