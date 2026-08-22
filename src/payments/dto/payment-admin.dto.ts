import {
  PaymentMethod,
  PaymentProviderCode,
  PaymentRoutingContext,
  PaymentTerminalStatus,
  PaymentTerminalIntegrationMode,
} from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateConnectionDto {
  @IsEnum(PaymentProviderCode) providerCode!: PaymentProviderCode;
  @IsString() @MinLength(2) @MaxLength(100) displayName!: string;
  @IsString() @MinLength(20) @MaxLength(4096) accessToken!: string;
}
export class CreateTerminalDto {
  @IsString() @MinLength(2) @MaxLength(100) nickname!: string;
  @IsEnum(PaymentProviderCode) providerCode!: PaymentProviderCode;
  @IsOptional() @IsUUID() connectionId?: string;
  @IsOptional() @IsString() @MaxLength(100) manufacturer?: string;
  @IsOptional() @IsString() @MaxLength(100) model?: string;
  @IsOptional() @IsString() @MaxLength(160) externalDeviceId?: string;
  @IsOptional() @IsString() @MaxLength(80) serialNumber?: string;
  @IsOptional() @IsEnum(PaymentTerminalStatus) status?: PaymentTerminalStatus;
  @IsOptional()
  @IsEnum(PaymentTerminalIntegrationMode)
  integrationMode?: PaymentTerminalIntegrationMode;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
export class SetRoutingDto {
  @IsEnum(PaymentMethod) method!: PaymentMethod;
  @IsEnum(PaymentRoutingContext) context!: PaymentRoutingContext;
  @IsUUID() connectionId!: string;
}
export class CreatePixPaymentDto {
  @IsUUID() orderId!: string;
  @IsInt() @Min(1) @Max(100000000) amountCents!: number;
  @IsString() @MinLength(8) @MaxLength(128) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(120) description?: string;
}
