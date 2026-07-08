import 'dotenv/config';
import { PrismaClient, SystemType } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import {
  describeDatabaseUrl,
  selectAdministrativeDatabaseUrl,
} from '../lib/admin-database-url';

type CliOptions = {
  email: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  const emailIndex = argv.indexOf('--email');
  const email =
    emailIndex >= 0 ? argv[emailIndex + 1]?.trim().toLowerCase() : '';

  if (!email) {
    throw new Error(
      'Usage: ts-node scripts/auth/audit-user.ts --email usuario@email.com --dry-run',
    );
  }

  return {
    email,
    dryRun: argv.includes('--dry-run') || !argv.includes('--apply'),
  };
}

function maskId(value?: string | null) {
  if (!value) return null;
  return `${value.slice(0, 8)}...`;
}

function validateSystemTypes(value: unknown) {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) => item === SystemType.padrao || item === SystemType.petshop,
  );
}

async function findSupabaseUserByEmail(email: string) {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return {
      configured: false,
      exists: null,
      id: null,
      emailConfirmedAt: null,
      disabledUntil: null,
    };
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const pageSize = 1000;

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: pageSize,
    });

    if (error) {
      throw new Error(`Supabase Auth audit failed: ${error.message}`);
    }

    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email,
    );

    if (user) {
      return {
        configured: true,
        exists: true,
        id: maskId(user.id),
        emailConfirmedAt: user.email_confirmed_at ?? null,
        disabledUntil: user.banned_until ?? null,
      };
    }

    if (data.users.length < pageSize) break;
  }

  return {
    configured: true,
    exists: false,
    id: null,
    emailConfirmedAt: null,
    disabledUntil: null,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const administrativeUrl = selectAdministrativeDatabaseUrl(process.env);
  console.log(
    `Using administrative database connection (${describeDatabaseUrl(administrativeUrl)}).`,
  );
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: administrativeUrl,
      },
    },
  });

  try {
    const [supabaseUser, profile] = await Promise.all([
      findSupabaseUserByEmail(options.email),
      prisma.userProfile.findUnique({
        where: { email: options.email },
        select: {
          id: true,
          supabaseUserId: true,
          email: true,
          role: true,
          systemType: true,
          allowedSystemTypes: true,
          isSuperAdmin: true,
          tenantId: true,
          primaryTenantId: true,
          employee: {
            select: {
              status: true,
              dismissalDate: true,
              deletedAt: true,
            },
          },
          tenant: {
            select: {
              id: true,
              systemType: true,
              mode: true,
            },
          },
          primaryTenant: {
            select: {
              id: true,
              systemType: true,
              mode: true,
            },
          },
          memberships: {
            select: {
              id: true,
              tenantId: true,
              branchId: true,
              role: true,
              tenant: {
                select: {
                  id: true,
                  systemType: true,
                  mode: true,
                },
              },
              branch: {
                select: {
                  id: true,
                  isActive: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const activeMemberships =
      profile?.memberships.filter(
        (membership) => membership.branch?.isActive,
      ) ?? [];
    const statusAllowsLogin =
      !profile?.employee ||
      (!profile.employee.deletedAt &&
        profile.employee.status === 'active' &&
        (!profile.employee.dismissalDate ||
          profile.employee.dismissalDate.getTime() > Date.now()));

    const report = {
      dryRun: options.dryRun,
      email: options.email,
      supabaseAuth: supabaseUser,
      profile: profile
        ? {
            exists: true,
            id: maskId(profile.id),
            supabaseUserId: maskId(profile.supabaseUserId),
            hasSupabaseUserId: Boolean(profile.supabaseUserId),
            tenantId: maskId(profile.tenantId),
            primaryTenantId: maskId(profile.primaryTenantId),
            tenantExists: Boolean(profile.tenant),
            primaryTenantExists: Boolean(profile.primaryTenant),
            role: profile.role,
            systemType: profile.systemType,
            systemTypeValid:
              profile.systemType === SystemType.padrao ||
              profile.systemType === SystemType.petshop,
            allowedSystemTypes: profile.allowedSystemTypes,
            allowedSystemTypesValid: validateSystemTypes(
              profile.allowedSystemTypes,
            ),
            isSuperAdmin: profile.isSuperAdmin,
            memberships: profile.memberships.map((membership) => ({
              id: maskId(membership.id),
              tenantId: maskId(membership.tenantId),
              branchId: maskId(membership.branchId),
              role: membership.role,
              tenantExists: Boolean(membership.tenant),
              branchExists: Boolean(membership.branch),
              branchActive: membership.branch?.isActive ?? false,
              systemType: membership.tenant?.systemType ?? null,
              mode: membership.tenant?.mode ?? null,
            })),
            hasActiveMembership: activeMemberships.length > 0,
            statusAllowsLogin,
          }
        : { exists: false },
      findings: {
        hasSupabaseWithoutProfile: Boolean(supabaseUser.exists && !profile),
        hasProfileWithoutSupabaseUserId: Boolean(
          profile && !profile.supabaseUserId,
        ),
        hasProfileWithoutTenant: Boolean(
          profile && !profile.primaryTenantId && !profile.tenantId,
        ),
        hasProfileWithoutActiveMembership: Boolean(
          profile && activeMemberships.length === 0,
        ),
        canLoginStructurally: Boolean(
          supabaseUser.exists &&
          profile?.supabaseUserId &&
          activeMemberships.length > 0 &&
          statusAllowsLogin,
        ),
      },
    };

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  const message =
    error instanceof Error ? error.message : 'Unknown audit error.';
  console.error(
    message.replace(/postgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DATABASE_URL]'),
  );
  process.exitCode = 1;
});
