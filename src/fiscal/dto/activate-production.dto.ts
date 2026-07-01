import { Equals, IsString } from 'class-validator';

export class ActivateProductionDto {
  @IsString()
  @Equals('ATIVAR PRODUÇÃO')
  confirmation!: string;
}
