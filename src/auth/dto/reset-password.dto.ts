import { IsString, Length, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(40, 200)
  token!: string;

  @IsString()
  @Length(12, 128)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  newPassword!: string;
}
