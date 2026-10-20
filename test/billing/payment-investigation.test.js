'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { investigate, providerGet } = require('../../scripts/billing/payment-investigation');

test('provider failures preserve HTTP status and do not expose sensitive body', async () => {
  const result = await providerGet('/v1/payments/1', 'secret', async () => ({ ok: false, status: 403 }));
  assert.deepEqual(result, { ok: false, httpStatus: 403 });
});
test('diagnostic scopes lookups to tenant and does not emit raw provider data', async () => {
  const tenantId = 'tenant-a';
  const prisma = {
    checkoutSession: { findFirst: async ({ where }) => { assert.equal(where.tenantId, tenantId); return { id: 'checkout-id', subscriptionId: 'subscription-id', status: 'COMPLETED', expectedAmountCents: 100, currency: 'BRL' }; } },
    billingPayment: { findMany: async ({ where }) => { assert.equal(where.tenantId, tenantId); return []; } },
    subscription: { findFirst: async ({ where }) => { assert.equal(where.tenantId, tenantId); return null; } },
    billingEvent: { findMany: async ({ where }) => { assert.equal(where.tenantId, tenantId); return []; } },
    gatewayWebhookEvent: { findMany: async () => [] },
  };
  const result = await investigate(prisma, tenantId, ['123456789'], 'secret', async () => ({ ok: true, json: async () => ({ id: 123456789, external_reference: 'sensitive-ref', status: 'approved', transaction_amount: 1, currency_id: 'BRL', payer: { email: 'private@example.com' } }) }));
  const output = JSON.stringify(result);
  assert.equal(result.payments[0].local.status, 'CHECKOUT_FOUND');
  assert.ok(!output.includes('private@example.com'));
  assert.ok(!output.includes('sensitive-ref'));
  assert.ok(!output.includes('secret'));
});
test('missing tenant checkout stops correlation without guessing', async () => {
  const prisma = { checkoutSession: { findFirst: async () => null } };
  const result = await investigate(prisma, 'tenant', ['123'], 'secret', async () => ({ ok: true, json: async () => ({ id: 123, external_reference: 'abc' }) }));
  assert.equal(result.payments[0].local.status, 'CHECKOUT_NOT_FOUND_FOR_TENANT');
});
