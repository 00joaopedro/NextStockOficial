import { IsIn, IsString, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MaxLength(255)
  email!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(120)
  companyName!: string;

  @IsString()
  @MaxLength(200)
  password!: string;

  @IsString()
  @IsIn(['padrao', 'petshop'])
  @MaxLength(20)
  systemType!: string;
}
