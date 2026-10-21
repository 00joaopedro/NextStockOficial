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

test('provider errors retain only a validated correlation id', async () => {
  const id = '62d2a9ba-c8b6-452d-a4c8-903a5c48a9be';
  assert.deepEqual(await providerGet('/x', 'secret', async () => ({ ok: false, status: 400, headers: { get: () => id } })), { ok: false, httpStatus: 400, providerRequestId: id });
  assert.deepEqual(await providerGet('/x', 'secret', async () => ({ ok: false, status: 400, headers: { get: () => 'secret' } })), { ok: false, httpStatus: 400 });
  assert.equal((await providerGet('/x', 'secret', async () => ({ ok: true, json: async () => { throw Error('secret'); } }))).error, 'INVALID_JSON');
  assert.equal((await providerGet('/x', 'secret', async () => { throw Error('secret'); })).error, 'NETWORK_OR_TIMEOUT');
});

test('invoice lookup uses the same subscription filter as the application and reports invalid response', async () => {
  const prisma = {
    checkoutSession: { findFirst: async () => ({ id: 'c', subscriptionId: 's' }) },
    billingPayment: { findMany: async () => [] },
    subscription: { findFirst: async () => ({ gatewaySubscriptionId: 'sub-1' }) },
    billingEvent: { findMany: async () => [] },
    gatewayWebhookEvent: { findMany: async () => [] },
  };
  const paths = [];
  const result = await investigate(prisma, 'tenant', ['123'], 'secret', async url => {
    paths.push(url);
    if (url.includes('/v1/payments/')) return { ok: true, json: async () => ({ id: 123, external_reference: 'ref' }) };
    if (url.includes('/preapproval/')) return { ok: true, json: async () => ({ id: 'sub-1' }) };
    return { ok: true, json: async () => ({ paging: { total: 0 } }) };
  });
  assert.equal(paths[2], 'https://api.mercadopago.com/authorized_payments/search?preapproval_id=sub-1');
  assert.deepEqual(result.payments[0].local.providerInvoices, { ok: false, error: 'INVALID_INVOICE_RESPONSE' });
});

test('invoice truncation accounts for the displayed limit and unknown provider total', async () => {
  const prisma = {
    checkoutSession: { findFirst: async () => ({ id: 'c', subscriptionId: 's' }) },
    billingPayment: { findMany: async () => [] },
    subscription: { findFirst: async () => ({ gatewaySubscriptionId: 'sub-1' }) },
    billingEvent: { findMany: async () => [] },
    gatewayWebhookEvent: { findMany: async () => [] },
  };
  async function report(count, total) {
    const result = await investigate(prisma, 'tenant', ['123'], 'secret', async url => {
      if (url.includes('/v1/payments/')) return { ok: true, json: async () => ({ id: 123, external_reference: 'ref' }) };
      if (url.includes('/preapproval/')) return { ok: true, json: async () => ({ id: 'sub-1' }) };
      return { ok: true, json: async () => ({ results: Array.from({ length: count }, () => ({ preapproval_id: 'sub-1' })), ...(total === undefined ? {} : { paging: { total } }) }) };
    });
    return result.payments[0].local.providerInvoices;
  }
  const locallyTruncated = await report(21, 21);
  assert.equal(locallyTruncated.truncated, true);
  assert.equal(locallyTruncated.results.length, 20);
  assert.equal((await report(21, undefined)).truncated, true);
  assert.equal((await report(20, 21)).truncated, true);
  assert.equal((await report(20, 20)).truncated, false);
  assert.equal((await report(20, undefined)).truncated, null);
});
