import { IsString, MaxLength, MinLength } from 'class-validator';

export class CancelSaleDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  cancellationReason!: string;
}
