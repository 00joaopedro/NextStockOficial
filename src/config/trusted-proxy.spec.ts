import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';
import { trustedProxyForFastify, trustedProxyHops } from './trusted-proxy';

describe('trusted proxy policy', () => {
  afterEach(() => delete process.env.TRUSTED_PROXY_HOPS);

  async function resolvedIp(hops: number, forwarded: string) {
    process.env.TRUSTED_PROXY_HOPS = String(hops);
    const options: FastifyServerOptions = {
      trustProxy: trustedProxyForFastify(),
    };
    const app = Fastify(options);
    app.get('/', (request) => ({ ip: request.ip, ips: request.ips }));
    const response = await app.inject({
      method: 'GET',
      url: '/',
      headers: { 'x-forwarded-for': forwarded },
      remoteAddress: '127.0.0.1',
    });
    await app.close();
    return response.json<{ ip: string; ips?: string[] }>();
  }

  it('defaults to trusting no proxy and ignores forged X-Forwarded-For', async () => {
    process.env.TRUSTED_PROXY_HOPS = '0';
    expect(trustedProxyHops()).toBe(0);
    await expect(resolvedIp(0, '198.51.100.9')).resolves.toMatchObject({
      ip: '127.0.0.1',
    });
  });

  it('resolves a controlled legitimate chain using the configured hop count', async () => {
    const result = await resolvedIp(2, '198.51.100.7, 10.0.0.2');
    expect(result.ip).toBe('198.51.100.7');
    expect(result.ips).toEqual(['127.0.0.1', '10.0.0.2', '198.51.100.7']);
  });

  it('does not trust forwarded elements beyond the configured chain', async () => {
    const result = await resolvedIp(1, '198.51.100.99, 10.0.0.2');
    expect(result.ip).toBe('10.0.0.2');
  });

  it('fails early for malformed or excessive hop configuration', () => {
    process.env.TRUSTED_PROXY_HOPS = 'all';
    expect(trustedProxyHops).toThrow('Invalid TRUSTED_PROXY_HOPS');
    process.env.TRUSTED_PROXY_HOPS = '11';
    expect(trustedProxyHops).toThrow('Invalid TRUSTED_PROXY_HOPS');
  });

  it.each([
    ['0', false],
    ['1', true],
    ['2', true],
  ])('converts %s hops to a closed Fastify trust policy', (configured, expected) => {
    process.env.TRUSTED_PROXY_HOPS = configured;
    const trustProxy = trustedProxyForFastify();
    if (trustProxy === false) {
      expect(expected).toBe(false);
      return;
    }
    expect(trustProxy('127.0.0.1', 0)).toBe(expected);
    expect(trustProxy('10.0.0.2', Number(configured))).toBe(false);
  });

  it('trusts exactly the configured hop boundary and never globally', () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    const trustProxy = trustedProxyForFastify();
    expect(trustProxy).not.toBe(false);
    if (trustProxy !== false) {
      expect(trustProxy('127.0.0.1', 0)).toBe(true);
      expect(trustProxy('10.0.0.2', 1)).toBe(true);
      expect(trustProxy('198.51.100.7', 2)).toBe(false);
      expect(trustProxy('198.51.100.7', 99)).toBe(false);
    }
  });
});
