import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PreviewMutationGuard } from './preview-mutation.guard';

function httpContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('PreviewMutationGuard', () => {
  it('bloqueia mutation em preview inclusive para Dev SuperAdmin', () => {
    const guard = new PreviewMutationGuard({
      isPreviewMode: () => true,
    } as any);

    expect(() =>
      guard.canActivate(
        httpContext({
          method: 'POST',
          path: '/api/products',
          user: {
            id: 'dev-id',
            email: 'dev@example.com',
            role: 'superAdmin',
            isSuperAdmin: true,
            isDevSuperAdmin: true,
          },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('permite leitura e mutation fora de preview', () => {
    const previewGuard = new PreviewMutationGuard({
      isPreviewMode: () => true,
    } as any);
    const productionGuard = new PreviewMutationGuard({
      isPreviewMode: () => false,
    } as any);

    expect(
      previewGuard.canActivate(
        httpContext({ method: 'GET', path: '/api/products' }),
      ),
    ).toBe(true);
    expect(
      productionGuard.canActivate(
        httpContext({ method: 'POST', path: '/api/products' }),
      ),
    ).toBe(true);
  });
});
