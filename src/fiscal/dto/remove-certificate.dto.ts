import { Equals, IsString } from 'class-validator';

export class RemoveCertificateDto {
  @IsString()
  @Equals('REMOVER CERTIFICADO')
  confirmation!: 'REMOVER CERTIFICADO';
}
