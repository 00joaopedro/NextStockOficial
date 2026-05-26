import { IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}
