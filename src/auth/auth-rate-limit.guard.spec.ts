import { normalizeIp } from './auth-rate-limit.guard';

describe('auth rate limit identity normalization', () => {
  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['2001:db8::1', '2001:db8:0:0:0:0:0:1'],
    ['2001:0db8:0000:0000:0000:0000:0000:0001', '2001:db8:0:0:0:0:0:1'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeIp(input)).toBe(expected);
  });
});
