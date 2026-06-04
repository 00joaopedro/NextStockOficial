import { SetMetadata } from '@nestjs/common';
import { Role, SystemType } from '@prisma/client';

export const TENANT_CONTEXT_OPTIONS = 'nextstock:tenant-context-options';

export type TenantContextMetadata = {
  requireBranch?: boolean;
  writable?: boolean;
  expectedSystemType?: SystemType;
  allowedRoles?: Role[];
};

export const RequireTenantContext = (options: TenantContextMetadata = {}) =>
  SetMetadata(TENANT_CONTEXT_OPTIONS, options);
