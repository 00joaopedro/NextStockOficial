import type { TrustProxyFunction } from 'fastify';

export function trustedProxyHops() {
  const value = process.env.TRUSTED_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(value) || Number(value) > 10) {
    throw new Error('Invalid TRUSTED_PROXY_HOPS configuration.');
  }
  return Number(value);
}

export function trustedProxyForFastify(): false | TrustProxyFunction {
  const hops = trustedProxyHops();
  if (hops === 0) return false;
  return (_address, hop) => hop < hops;
}
