import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelFiscalDocumentDto {
  @IsString()
  @MinLength(15)
  @MaxLength(255)
  cancellationReason!: string;
}
