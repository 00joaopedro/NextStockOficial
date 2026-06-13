import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateSaleDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  series?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  accessKey?: string;
}
