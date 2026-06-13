import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SendFiscalDocumentDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  confirmationNote?: string;
}
