import { Role } from '@prisma/client';

export const PRODUCTION_TEST_PLAN_SLUG = 'production-test-r1';

export function canUseProductionTestCheckout(
  user: AuthenticatedUser | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const enabled =
    env.BILLING_PRODUCTION_TEST_ENABLED?.trim().toLowerCase() === 'true';
  const configuredEmail =
    env.BILLING_PRODUCTION_TEST_ADMIN_EMAIL?.trim().toLowerCase();
  const userEmail = user?.email?.trim().toLowerCase();

  return (
    enabled &&
    user?.role === Role.Admin &&
    Boolean(configuredEmail) &&
    configuredEmail === userEmail
  );
}
