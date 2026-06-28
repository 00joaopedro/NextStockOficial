import { of } from 'rxjs';
import { BillingAccessInterceptor } from './billing-access.interceptor';

describe('BillingAccessInterceptor', () => {
  beforeEach(() => {
    process.env.BILLING_ENFORCEMENT_ENABLED = 'true';
  });

  function context(user: any) {
    return {
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as any;
  }

  it('retorna 402 estruturado quando entitlement bloqueia', async () => {
    const interceptor = new BillingAccessInterceptor(
      { getAllAndOverride: () => false } as any,
      {
        forUser: jest.fn().mockResolvedValue({
          allowed: false,
          reason: 'TRIAL_EXPIRED',
          redirectTo: '/perfil.html',
        }),
      } as any,
    );
    await expect(
      interceptor.intercept(context({ tenantId: 'tenant' }), {
        handle: () => of(true),
      }),
    ).rejects.toMatchObject({ status: 402 });
  });

  it('BillingExempt ignora enforcement', async () => {
    const entitlement = { forUser: jest.fn() };
    const interceptor = new BillingAccessInterceptor(
      { getAllAndOverride: () => true } as any,
      entitlement as any,
    );
    const stream = await interceptor.intercept(context({ tenantId: 'tenant' }), {
      handle: () => of('ok'),
    });
    expect(entitlement.forUser).not.toHaveBeenCalled();
    expect(stream).toBeDefined();
  });
});
