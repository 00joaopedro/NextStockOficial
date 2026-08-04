export function trustedProxyHops() {
  const value = process.env.TRUSTED_PROXY_HOPS ?? '0';
  if (!/^\d+$/.test(value) || Number(value) > 10) {
    throw new Error('Invalid TRUSTED_PROXY_HOPS configuration.');
  }
  return Number(value);
}
