import type { FastifyServerOptions } from 'fastify';

type FastifyTrustProxyFunction = Extract<
  NonNullable<FastifyServerOptions['trustProxy']>,
  (address: string, hop: number) => boolean
>;

export function trustedProxyHops() {
  const value = process.env.TRUSTED_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(value) || Number(value) > 10) {
    throw new Error('Invalid TRUSTED_PROXY_HOPS configuration.');
  }
  return Number(value);
}

export function trustedProxyForFastify(): false | FastifyTrustProxyFunction {
  const hops = trustedProxyHops();
  if (hops === 0) return false;
  return (_address, hop) => hop < hops;
}
