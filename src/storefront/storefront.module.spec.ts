import { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SystemMode, SystemType } from '@prisma/client';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { PreviewModePolicyService } from '../system/preview-mode-policy.service';
import { SystemModule } from '../system/system.module';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { StorefrontModule } from './storefront.module';

jest.mock('jwks-rsa', () => ({ passportJwtSecret: jest.fn() }));

function httpContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('StorefrontModule preview composition', () => {
  const tenantContext = { resolve: jest.fn() };

  async function compileModule() {
    return Test.createTestingModule({ imports: [StorefrontModule] })
      .overrideProvider(TenantContextService)
      .useValue(tenantContext)
      .compile();
  }

  beforeEach(() => tenantContext.resolve.mockReset());

  it('resolve o guard e compartilha a mesma policy exportada pelo SystemModule', async () => {
    const moduleRef = await compileModule();
    const system = moduleRef.select(SystemModule);
    const guard = system.get(PreviewMutationGuard, { strict: true });
    const policy = system.get(PreviewModePolicyService, { strict: true });

    expect(guard).toBeInstanceOf(PreviewMutationGuard);
    expect(policy).toBeInstanceOf(PreviewModePolicyService);
    expect((guard as any).policy).toBe(policy);

    await moduleRef.close();
  });

  it('bloqueia mutacao em visualizacao e permite fora dela', async () => {
    const moduleRef = await compileModule();
    const guard = moduleRef
      .select(SystemModule)
      .get(PreviewMutationGuard, { strict: true });
    const user = {
      id: 'user-1',
      role: 'Admin',
      branchId: 'branch-1',
    };
    const baseContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      role: 'Admin',
      systemType: SystemType.padrao,
      isDevSuperAdmin: false,
      contextKind: 'normal',
    };

    tenantContext.resolve.mockResolvedValueOnce({
      ...baseContext,
      mode: SystemMode.visualizacao,
    });
    await expect(
      guard.canActivate(httpContext({ method: 'POST', user, headers: {} })),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_MODE_MUTATION_BLOCKED' } });

    tenantContext.resolve.mockResolvedValueOnce({
      ...baseContext,
      mode: SystemMode.padrao,
    });
    await expect(
      guard.canActivate(httpContext({ method: 'POST', user, headers: {} })),
    ).resolves.toBe(true);

    await moduleRef.close();
  });
});
