import { Role } from '@prisma/client';
import { IsIn } from 'class-validator';

export class UpdateTenantUserRoleDto {
  @IsIn([Role.Admin, Role.Vendedor, Role.Comprador])
  role!: Role;
}
