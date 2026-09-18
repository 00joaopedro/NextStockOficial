import { IsIn, IsNotEmpty, IsString, Length, MaxLength, Matches } from 'class-validator';
import { LOCAL_PASSWORD_MAX_LENGTH, PASSWORD_POLICY_MESSAGE } from '../local-password';

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
  @MaxLength(LOCAL_PASSWORD_MAX_LENGTH)
  @Matches(/^[^\u0000-\u001F\u007F]+$/, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}
