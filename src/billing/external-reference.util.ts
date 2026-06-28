import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

function secret() {
  return (
    process.env.BILLING_EXTERNAL_REFERENCE_SECRET ||
    process.env.JWT_SECRET ||
    'nextstock-local-development'
  );
}

export function createBillingExternalReference() {
  const id = randomUUID();
  const signature = createHmac('sha256', secret())
    .update(id)
    .digest('hex')
    .slice(0, 16);
  return `ns_cs_${id}_${signature}`;
}

export function isValidBillingExternalReference(value: string) {
  const match = /^ns_cs_([0-9a-f-]{36})_([a-f0-9]{16})$/i.exec(value);
  if (!match) return false;
  const expected = createHmac('sha256', secret())
    .update(match[1])
    .digest('hex')
    .slice(0, 16);
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(match[2], 'hex'),
  );
}
