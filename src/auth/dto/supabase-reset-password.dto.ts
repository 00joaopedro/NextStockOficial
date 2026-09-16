import { IsIn, IsNotEmpty, IsString, Length, MaxLength, Matches } from 'class-validator';

export class SupabaseResetPasswordDto {
  @IsIn(['recovery'])
  recoveryType!: 'recovery';

  @IsString()
  @Length(20, 4096)
  accessToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  refreshToken!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  newPassword!: string;
}
