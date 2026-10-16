import { Role } from '@prisma/client';
import {
  canUseProductionTestCheckout,
  PRODUCTION_TEST_PLAN_SLUG,
} from './production-test-access';

describe('production test checkout access', () => {
  const user = {
    email: '0oficialwhis@gmail.com',
    role: Role.Admin,
  } as AuthenticatedUser;

  const env = {
    BILLING_PRODUCTION_TEST_ENABLED: 'true',
    BILLING_PRODUCTION_TEST_ADMIN_EMAIL: '0oficialwhis@gmail.com',
  };

  it('allows only the configured tenant admin email', () => {
    expect(canUseProductionTestCheckout(user, env)).toBe(true);
    expect(PRODUCTION_TEST_PLAN_SLUG).toBe('production-test-r1');
  });

  it('rejects another email or a non-admin role', () => {
    expect(
      canUseProductionTestCheckout(
        { ...user, email: 'other@example.com' },
        env,
      ),
    ).toBe(false);
    expect(
      canUseProductionTestCheckout({ ...user, role: Role.Vendedor }, env),
    ).toBe(false);
  });

  it('rejects the route while the feature flag is disabled', () => {
    expect(
      canUseProductionTestCheckout(user, {
        ...env,
        BILLING_PRODUCTION_TEST_ENABLED: 'false',
      }),
    ).toBe(false);
  });
});
