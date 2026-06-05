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
      tenantId?: string;
      systemType?: string;
      role?: Role;
      mode?: string;
      isDevWorkspace?: boolean;
      isSupportContext?: boolean;
    }

    interface AuthenticatedUser {
      id: string;
      supabaseUserId?: string | null;
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
      isDevSuperAdmin?: boolean;
      mode?: string | null;
      branches?: Array<BranchSummary & {
        tenantId: string;
        tenant: TenantSummary | null;
        systemType: string;
      }>;
      devWorkspaces?: Array<{
        systemType: string;
        selectedBranch: BranchSummary & {
          tenantId: string;
          systemType: string;
          isDevWorkspace: true;
        };
      }>;
    }

    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
