import { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface TenantSummary {
      id: string;
      name: string;
      slug: string;
      systemType: string;
    }

    interface BranchSummary {
      id: string;
      name: string;
      slug: string;
    }

    interface AuthenticatedUser {
      id: string;
      email: string | null;
      name: string;
      fullName?: string | null;
      role: Role;
      roles: Role[];
      tenantId: string | null;
      primaryTenantId?: string | null;
      tenant: TenantSummary | null;
      branchId: string | null;
      branch: BranchSummary | null;
      systemType: string | null;
      allowedSystemTypes?: string[];
      isSuperAdmin?: boolean;
      is_super_admin?: boolean;
      mode?: string | null;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
