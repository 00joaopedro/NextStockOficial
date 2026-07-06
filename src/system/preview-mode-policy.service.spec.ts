import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SystemMode, SystemType } from '@prisma/client';
import { PreviewModePolicyService } from './preview-mode-policy.service';

function request(method: string, user?: Record<string, unknown>) {
  return {
    method,
    user,
    header: jest.fn().mockReturnValue(undefined),
  } as unknown as Parameters<
    PreviewModePolicyService['assertMutationAllowed']
  >[0];
}

describe('PreviewModePolicyService', () => {
  const context = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    role: 'Admin',
    systemType: SystemType.padrao,
    mode: SystemMode.visualizacao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  };
  const tenantContext = { resolve: jest.fn() };

  beforeEach(() => tenantContext.resolve.mockReset());

  it.each(['GET', 'HEAD', 'OPTIONS'])(
    'permite %s sem consultar contexto',
    async (method) => {
      const policy = new PreviewModePolicyService(tenantContext as any);
      await expect(
        policy.assertMutationAllowed(request(method)),
      ).resolves.toBeUndefined();
      expect(tenantContext.resolve).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    'bloqueia %s no tenant em visualização com code estável',
    async (method) => {
      tenantContext.resolve.mockResolvedValue(context);
      const policy = new PreviewModePolicyService(tenantContext as any);

      try {
        await policy.assertMutationAllowed(
          request(method, {
            id: 'user-1',
            role: 'Admin',
            branchId: 'branch-1',
          }),
        );
        throw new Error('expected preview block');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toMatchObject({
          code: 'PREVIEW_MODE_MUTATION_BLOCKED',
          message: 'Modo visualização: ação bloqueada.',
        });
      }
    },
  );

  it('permite mutação fora de visualização', async () => {
    tenantContext.resolve.mockResolvedValue({
      ...context,
      mode: SystemMode.padrao,
    });
    const policy = new PreviewModePolicyService(tenantContext as any);

    await expect(
      policy.assertMutationAllowed(
        request('POST', {
          id: 'user-1',
          role: 'Admin',
          branchId: 'branch-1',
        }),
      ),
    ).resolves.toBeUndefined();
  });

  it('não interfere em endpoints públicos sem usuário autenticado', async () => {
    const policy = new PreviewModePolicyService(tenantContext as any);
    await expect(
      policy.assertMutationAllowed(request('POST')),
    ).resolves.toBeUndefined();
    expect(tenantContext.resolve).not.toHaveBeenCalled();
  });

  it('exige contexto operacional em mutação de Dev SuperAdmin', async () => {
    process.env.DEV_SUPER_ADMIN_EMAILS = 'dev@example.com';
    const policy = new PreviewModePolicyService(tenantContext as any);

    await expect(
      policy.assertMutationAllowed(
        request('POST', {
          id: 'dev-1',
          email: 'dev@example.com',
          role: 'superAdmin',
          roles: ['superAdmin'],
          isDevSuperAdmin: true,
          branchId: null,
          mode: SystemMode.padrao,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    process.env.DEV_SUPER_ADMIN_EMAILS = '';
  });
});
