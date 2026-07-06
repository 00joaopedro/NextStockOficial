import { ExecutionContext } from '@nestjs/common';
import { PreviewMutationGuard } from './preview-mutation.guard';

function httpContext(request: Record<string, unknown>) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('PreviewMutationGuard', () => {
  it('delega a decisão tenant-aware para a política', async () => {
    const assertMutationAllowed = jest.fn().mockResolvedValue(undefined);
    const guard = new PreviewMutationGuard({
      assertMutationAllowed,
    } as any);
    const request = { method: 'POST', path: '/api/products' };

    await expect(guard.canActivate(httpContext(request))).resolves.toBe(true);
    expect(assertMutationAllowed).toHaveBeenCalledWith(request);
  });

  it('propaga o bloqueio produzido pela política', async () => {
    const blocked = new Error('blocked');
    const guard = new PreviewMutationGuard({
      assertMutationAllowed: jest.fn().mockRejectedValue(blocked),
    } as any);

    await expect(
      guard.canActivate(
        httpContext({ method: 'PATCH', path: '/api/products/1' }),
      ),
    ).rejects.toBe(blocked);
  });
});
