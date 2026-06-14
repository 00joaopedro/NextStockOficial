import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  fullName!: string;
}
