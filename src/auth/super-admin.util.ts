import { Role, SystemType } from '@prisma/client';

type SuperAdminCandidate = {
  id?: string | null;
  email?: string | null;
  supabaseUserId?: string | null;
  supabase_user_id?: string | null;
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

export function parseAllowlistEnv(value?: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function isDevSuperAdmin(user?: SuperAdminCandidate | null): boolean {
  if (!isSuperAdmin(user)) {
    return false;
  }

  const allowedEmails = parseAllowlistEnv(process.env.DEV_SUPER_ADMIN_EMAILS);
  const allowedIds = parseAllowlistEnv(process.env.DEV_SUPER_ADMIN_USER_IDS);
  const email = user?.email?.trim().toLowerCase();
  const ids = [user?.id, user?.supabaseUserId, user?.supabase_user_id].reduce<
    string[]
  >((items, value) => {
    const normalized = value?.trim().toLowerCase();

    return normalized ? [...items, normalized] : items;
  }, []);

  return (
    (Boolean(email) && allowedEmails.includes(email as string)) ||
    ids.some((id) => allowedIds.includes(id))
  );
}

export const canAccessDev = isDevSuperAdmin;
export const hasFullDevAccess = isDevSuperAdmin;
