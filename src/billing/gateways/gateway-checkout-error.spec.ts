import { GatewayCheckoutError } from './payment-gateway.interface';

describe('GatewayCheckoutError', () => {
  it('classifies provider rejection as final without exposing provider details', () => {
    const error = new GatewayCheckoutError(
      'Mercado Pago rejeitou a operacao.',
      true,
      {
        code: 'preapproval_plan_not_found',
        providerStatus: 404,
        providerRequestId: 'provider-request-id',
        state: 'FAILED_FINAL',
      },
    );

    expect(error.getStatus()).toBe(502);
    expect(error.checkoutState).toBe('FAILED_FINAL');
    expect(error.failureCode).toBe('preapproval_plan_not_found');
    expect(error.providerStatus).toBe(404);
    expect(error.message).not.toContain('provider-request-id');
  });

  it('keeps timeout outcomes unknown for safe recovery', () => {
    const error = new GatewayCheckoutError(
      'Mercado Pago temporariamente indisponivel.',
      true,
      { code: 'GATEWAY_TIMEOUT', state: 'UNKNOWN' },
    );

    expect(error.checkoutState).toBe('UNKNOWN');
  });

  it('marks a failure before the request as retryable', () => {
    const error = new GatewayCheckoutError(
      'Gateway indisponivel.',
      false,
      { code: 'GATEWAY_NOT_STARTED' },
    );

    expect(error.checkoutState).toBe('FAILED_RETRYABLE');
  });
});
