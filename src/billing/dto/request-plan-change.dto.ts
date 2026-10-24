import { IsString, Matches } from 'class-validator';

export class RequestPlanChangeDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  planSlug!: string;
}
