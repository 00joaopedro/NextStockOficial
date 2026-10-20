export class RecoveryValidationError extends Error {
  constructor(
    readonly code:
      | 'INVALID_INPUT'
      | 'PAYMENT_NOT_ELIGIBLE'
      | 'PAYMENT_CORRELATION_FAILED',
  ) {
    super(code);
  }
}

export function recoveryFailureCode(error: unknown): string {
  return error instanceof RecoveryValidationError
    ? error.code
    : 'UNEXPECTED_ERROR';
}
