import { IsString, MaxLength, MinLength } from 'class-validator';
import { LOCAL_PASSWORD_MAX_LENGTH, LOCAL_PASSWORD_MIN_LENGTH } from '../../auth/local-password';

export class ResetEmployeePasswordDto {
  @IsString()
  @MinLength(LOCAL_PASSWORD_MIN_LENGTH)
  @MaxLength(LOCAL_PASSWORD_MAX_LENGTH)
  password!: string;
}
