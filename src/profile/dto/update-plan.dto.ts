import { IsString, MaxLength } from 'class-validator';

export class UpdatePlanDto {
  @IsString()
  @MaxLength(40)
  planSlug!: string;
}
