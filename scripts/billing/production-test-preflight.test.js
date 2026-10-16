'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validatePlan, sanitizeText } = require('./production-test-preflight');

test('accepts the expected active BRL production test plan', () => {
  const result = validatePlan(
    {
      id: 'plan-1',
      status: 'active',
      collector_id: 'collector-1',
      auto_recurring: {
        transaction_amount: 1,
        currency_id: 'BRL',
        frequency: 1,
        frequency_type: 'months',
      },
    },
    'collector-1',
  );
  assert.equal(result.ok, true);
});

test('rejects a plan with an incompatible owner or amount', () => {
  const result = validatePlan(
    {
      id: 'plan-1',
      status: 'active',
      collector_id: 'other-collector',
      auto_recurring: {
        transaction_amount: 200,
        currency_id: 'BRL',
        frequency: 1,
        frequency_type: 'months',
      },
    },
    'collector-1',
  );
  assert.equal(result.ok, false);
  assert.equal(result.failures.length, 2);
});

test('sanitizes provider text before it reaches logs or terminal output', () => {
  assert.equal(sanitizeText('bad\nvalue <secret>'), 'bad value _secret_');
});
