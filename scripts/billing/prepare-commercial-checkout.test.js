'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prepare, modeFor } = require('./prepare-commercial-checkout');
function fixture() {
  const plans = ['ouro', 'esmeralda', 'diamante'].map(slug => ({ id: slug, slug, isActive: true, deletedAt: null, priceCents: 20000, gatewayMappings: [] }));
  const writes = [];
  const db = { plan: { findMany: async () => plans },
    gatewayPlanMapping: { upsert: async input => { writes.push(input); plans.find(p => p.id === input.create.planId).gatewayMappings.push(input.create); } },
    $transaction: async fn => fn(db),
  };
  return { db, plans, writes };
}
test('dry run never writes; apply creates only mappings with no external placeholder', async () => {
  const f = fixture();
  assert.equal((await prepare(f.db, {})).ready, false);
  assert.equal(f.writes.length, 0);
  assert.equal((await prepare(f.db, {}, true)).ready, true);
  assert.equal(f.writes.length, 3);
  for (const w of f.writes) { assert.equal(w.create.gatewayPlanId, null); assert.deepEqual(w.update, {}); }
  await prepare(f.db, {}, true);
  assert.equal(f.writes.length, 3);
  assert.ok(f.plans.every(p => p.priceCents === 20000));
});
test('preserves live mappings and refuses disabled plans or mappings', async () => {
  const f = fixture();
  f.plans[0].gatewayMappings.push({ isActive: true, gatewayPlanId: 'existing-id' });
  await prepare(f.db, {}, true);
  assert.equal(f.writes.length, 2);
  f.plans[1].isActive = false;
  await assert.rejects(prepare(f.db, {}, true), /INACTIVE_PLAN/);
  const g = fixture(); g.plans[0].gatewayMappings.push({ isActive: false });
  await assert.rejects(prepare(g.db, {}, true), /INACTIVE_MAPPING/);
});
test('rejects inconsistent modes before database access', () => {
  assert.throws(() => modeFor({ BILLING_MODE: 'production', MERCADO_PAGO_MODE: 'sandbox' }), /MISMATCH/);
  assert.equal(modeFor({ BILLING_MODE: ' production ', MERCADO_PAGO_MODE: 'production' }), 'production');
});
