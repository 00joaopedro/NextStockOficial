import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FiscalRecipientDto } from '../../fiscal/dto/create-nfe55-document.dto';

export class CreateSaleDocumentDto {
  @IsUUID()
  idempotencyKey!: string;

  @ValidateNested()
  @Type(() => FiscalRecipientDto)
  recipient!: FiscalRecipientDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  operationNature?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  buyerPresence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1)
  finalConsumer?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  freightCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalInformation?: string;
}
