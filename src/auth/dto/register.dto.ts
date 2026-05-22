import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  systemType?: string;
}
