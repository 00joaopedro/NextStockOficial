import { IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @MaxLength(255)
  email!: string;
}
