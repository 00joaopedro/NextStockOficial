import {
  RecoveryValidationError,
  recoveryFailureCode,
} from './payment-recovery-errors';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

describe('payment recovery failure reporting', () => {
  it('reports an expected validation code', () => {
    expect(
      recoveryFailureCode(new RecoveryValidationError('INVALID_INPUT')),
    ).toBe('INVALID_INPUT');
    expect(
      recoveryFailureCode(new RecoveryValidationError('PAYMENT_NOT_ELIGIBLE')),
    ).toBe('PAYMENT_NOT_ELIGIBLE');
    expect(
      recoveryFailureCode(
        new RecoveryValidationError('PAYMENT_CORRELATION_FAILED'),
      ),
    ).toBe('PAYMENT_CORRELATION_FAILED');
  });

  it('does not expose provider, database or secret error messages', () => {
    expect(
      recoveryFailureCode(new Error('secret database URL and token')),
    ).toBe('UNEXPECTED_ERROR');
  });

  it('reports application initialization failures through the CLI without exposing secrets', () => {
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        'ts-node/register/transpile-only',
        '-r',
        join(process.cwd(), 'test/billing/recovery-init-failure-preload.cjs'),
        join(process.cwd(), 'scripts/maintenance/billing-recover-payment.ts'),
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          BILLING_RECOVERY_TENANT_ID: '3276c4e7-249d-45a5-8a4d-5abf7e71244a',
          BILLING_RECOVERY_PAYMENT_ID: '184052133195',
        },
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toBe('RECOVERY_FAILED code=UNEXPECTED_ERROR\n');
    expect(result.stdout).toBe('');
  });
});
