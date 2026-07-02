import { Type } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PetClientAddressDto } from './pet-client-address.dto';

export class CreatePetClientDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(25)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  document?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PetClientAddressDto)
  address?: PetClientAddressDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
