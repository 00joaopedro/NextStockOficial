import {
  RecoveryValidationError,
  recoveryFailureCode,
} from './payment-recovery-errors';

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
});
