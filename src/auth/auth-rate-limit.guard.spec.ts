import {
  normalizeIp,
  resolveAuthRateLimitAction,
} from './auth-rate-limit.guard';

describe('auth rate limit identity normalization', () => {
  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['2001:db8::1', '2001:db8:0:0:0:0:0:1'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0:0:0:0:1'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });

  it('resolves distinct sanitized route actions', () => {
    expect(
      resolveAuthRateLimitAction({
        method: 'post',
        route: { path: '/auth/login' },
      }),
    ).toBe('POST:/auth/login');
    expect(
      resolveAuthRateLimitAction({
        method: 'POST',
        path: '/auth/register',
        url: '/auth/register?email=synthetic',
      }),
    ).toBe('POST:/auth/register');
    expect(
      resolveAuthRateLimitAction({
        method: 'POST',
        originalUrl: '/auth/forgot-password?email=synthetic',
      }),
    ).toBe('POST:/auth/forgot-password');
  });

  it('uses an explicit fail-closed action when no route exists', () => {
    expect(resolveAuthRateLimitAction({ method: 'POST' })).toBe(
      'POST:unknown-auth-route',
    );
    expect(
      resolveAuthRateLimitAction({ method: 'POST', url: '?token=secret' }),
    ).toBe('POST:unknown-auth-route');
  });
});
