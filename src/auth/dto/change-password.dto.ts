import { IsString, Length, Matches } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword!: string;

  @IsString()
  @Length(12, 128)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  newPassword!: string;
}
