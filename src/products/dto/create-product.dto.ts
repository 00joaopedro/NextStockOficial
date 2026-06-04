import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @MaxLength(120)
  nome!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precoCusto!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  percentualLucro!: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0)
  precoVenda?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantidade!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  marca?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categoria?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fornecedor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codigoBarra?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  descricao?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  peso?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  altura?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  largura?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsUrl({ require_protocol: true })
  @MaxLength(300)
  linkExterno?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tamanhoRoupa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  tamanhoVestimenta?: string;
}
