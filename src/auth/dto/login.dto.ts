import { IsOptional, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  accessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branch?: string;
}
