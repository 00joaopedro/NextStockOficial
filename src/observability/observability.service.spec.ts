import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('redacts sensitive fields from structured stdout logs', () => {
    const spy = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    new ObservabilityService().log({
      eventType: 'test',
      password: 'never',
      headers: { authorization: 'Bearer never', safe: 'ok' },
    });
    const output = String(spy.mock.calls[0][0]);
    expect(output).toContain('"safe":"ok"');
    expect(output).not.toContain('Bearer never');
    expect(output).not.toContain('"password"');
    spy.mockRestore();
  });
});
