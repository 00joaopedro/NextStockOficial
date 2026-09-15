import { IsIn, IsString, Length, Matches } from 'class-validator';

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
  @Length(12, 128)
  @Matches(/^[^\u0000-\u001F\u007F]+$/)
  newPassword!: string;
}
