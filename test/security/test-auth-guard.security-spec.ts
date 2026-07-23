import type { ExecutionContext } from '@nestjs/common';
import { Role, SystemMode, SystemType } from '@prisma/client';
import { DeterministicTestAuthGuard } from '../helpers/test-auth.guard';

type GuardRequest = {
  headers: Record<string, string | undefined>;
  server: { securityTestUsers: Map<string, AuthenticatedUser> };
  user?: AuthenticatedUser;
  testUser?: AuthenticatedUser;
};

function contextFor(request: GuardRequest): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('DeterministicTestAuthGuard', () => {
  const user: AuthenticatedUser = {
    id: 'known-admin',
    email: 'admin@test.local',
    name: 'Known Admin',
    role: Role.Admin,
    roles: [Role.Admin],
    tenantId: 'tenant-a',
    primaryTenantId: 'tenant-a',
    tenant: null,
    branchId: 'branch-a',
    branch: null,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    branches: [],
    isSuperAdmin: false,
  };

  function requestFor(id?: string): GuardRequest {
    return {
      headers: {
        'x-test-user-id': id,
        'x-nextstock-tenant-id': 'tenant-b',
        'x-nextstock-branch-id': 'branch-b',
        'x-role': Role.superAdmin,
        'x-system-mode': SystemMode.visualizacao,
        'x-system-type': SystemType.petshop,
      },
      server: { securityTestUsers: new Map([[user.id, user]]) },
    };
  }

  it('rejects an absent or unknown deterministic identity', () => {
    const guard = new DeterministicTestAuthGuard();
    expect(guard.canActivate(contextFor(requestFor()))).toBe(false);
    expect(guard.canActivate(contextFor(requestFor('unknown')))).toBe(false);
  });

  it('preserves the registered role, tenant, branch, mode and system type', () => {
    const request = requestFor(user.id);
    expect(
      new DeterministicTestAuthGuard().canActivate(contextFor(request)),
    ).toBe(true);
    expect(request.user).toBe(user);
    expect(request.user).toMatchObject({
      role: Role.Admin,
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      mode: SystemMode.padrao,
      systemType: SystemType.padrao,
    });
  });
});
