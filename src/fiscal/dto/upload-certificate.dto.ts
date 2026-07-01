import { IsDefined, IsString, MaxLength } from 'class-validator';

export class UploadCertificateDto {
  @IsDefined()
  @IsString()
  @MaxLength(512)
  password!: string;
}
