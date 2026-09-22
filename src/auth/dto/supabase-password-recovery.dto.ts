import { IsIn, IsString, Length, Matches } from 'class-validator';
import { LOCAL_PASSWORD_MAX_LENGTH, LOCAL_PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE } from '../local-password';

export class SupabasePasswordRecoveryDto {
  @IsString()
  @IsIn(['recovery'])
  recoveryType!: 'recovery';

  @IsString()
  @Length(20, 4096)
  accessToken!: string;
  @IsString()
  @Length(20, 4096)
  refreshToken!: string;
  @IsString()
  @Length(LOCAL_PASSWORD_MIN_LENGTH, LOCAL_PASSWORD_MAX_LENGTH, { message: PASSWORD_POLICY_MESSAGE })
  @Matches(/^[^\u0000-\u001F\u007F]+$/, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}
