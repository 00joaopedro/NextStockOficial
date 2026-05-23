import { Role, SystemType } from '@prisma/client';

type SuperAdminCandidate = {
  role?: Role | string | null;
  roles?: Array<Role | string> | null;
  isSuperAdmin?: boolean | null;
  is_super_admin?: boolean | null;
};

export const SUPER_ADMIN_SYSTEM_TYPES = [SystemType.padrao, SystemType.petshop];

export function isSuperAdmin(user?: SuperAdminCandidate | null): boolean {
  if (!user) {
    return false;
  }

  return (
    user.role === Role.superAdmin ||
    user.role === 'superAdmin' ||
    user.roles?.includes(Role.superAdmin) ||
    user.roles?.includes('superAdmin') ||
    user.isSuperAdmin === true ||
    user.is_super_admin === true
  );
}

export const hasFullDevAccess = isSuperAdmin;
