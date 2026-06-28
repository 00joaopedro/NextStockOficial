import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdatePartnerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9()\-\s]{10,24}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  bankNumber?: string;
}
