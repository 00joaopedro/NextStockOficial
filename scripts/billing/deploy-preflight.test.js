'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runDeployPreflight } = require('./deploy-preflight');

function validEnv(overrides = {}) {
  return {
    APP_ENV: 'production',
    PUBLIC_APP_URL: 'https://www.nextstocks.online',
    PRODUCTION_APP_HOST: 'www.nextstocks.online',
    CORS_ALLOWED_ORIGINS: 'https://www.nextstocks.online',
    BILLING_WEBHOOK_ENABLED: 'true',
    MERCADO_PAGO_MODE: 'production',
    MERCADO_PAGO_ACCESS_TOKEN: 'APP_USR-secret-token',
    MERCADO_PAGO_WEBHOOK_SECRET: 'w'.repeat(32),
    MERCADO_PAGO_COLLECTOR_ID: 'collector-123',
    BILLING_EXTERNAL_REFERENCE_SECRET: 'r'.repeat(40),
    ...overrides,
  };
}

test('accepts a production webhook configuration and reports no secret values', () => {
  const env = validEnv({
    MERCADO_PAGO_WEBHOOK_URL:
      'https://www.nextstocks.online/api/billing/webhooks/mercado-pago',
  });
  const result = runDeployPreflight(env);
  assert.equal(result.ok, true);
  assert.equal(
    result.expectedWebhookUrl,
    'https://www.nextstocks.online/api/billing/webhooks/mercado-pago',
  );
  const output = JSON.stringify(result);
  assert.ok(!output.includes(env.MERCADO_PAGO_ACCESS_TOKEN));
  assert.ok(!output.includes(env.MERCADO_PAGO_WEBHOOK_SECRET));
  assert.ok(!output.includes(env.BILLING_EXTERNAL_REFERENCE_SECRET));
});

test('blocks missing secrets and disabled webhook without printing their values', () => {
  const result = runDeployPreflight(
    validEnv({
      BILLING_WEBHOOK_ENABLED: 'false',
      MERCADO_PAGO_ACCESS_TOKEN: '',
      MERCADO_PAGO_WEBHOOK_SECRET: 'short',
      BILLING_EXTERNAL_REFERENCE_SECRET: 'short',
    }),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.sort(), [
    'BILLING_EXTERNAL_REFERENCE_SECRET_MISSING_OR_INVALID',
    'BILLING_WEBHOOK_ENABLED_REQUIRED',
    'MERCADO_PAGO_ACCESS_TOKEN_MISSING_OR_INVALID',
    'MERCADO_PAGO_WEBHOOK_SECRET_MISSING_OR_INVALID',
  ]);
});

test('blocks non-HTTPS localhost and mismatched webhook URLs', () => {
  const result = runDeployPreflight(
    validEnv({
      PUBLIC_APP_URL: 'http://localhost:3000',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
      MERCADO_PAGO_WEBHOOK_URL: 'https://wrong.example/api/billing/webhooks/mercado-pago',
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('PUBLIC_APP_URL_HTTPS_REQUIRED'));
  assert.ok(result.errors.includes('MERCADO_PAGO_WEBHOOK_URL_MISMATCH'));
});

test('blocks a public URL missing from CORS and a non-production mode', () => {
  const result = runDeployPreflight(
    validEnv({
      CORS_ALLOWED_ORIGINS: 'https://admin.nextstocks.online',
      MERCADO_PAGO_MODE: 'sandbox',
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('CORS_PUBLIC_APP_URL_MISSING'));
  assert.ok(result.errors.includes('MERCADO_PAGO_PRODUCTION_MODE_REQUIRED'));
});

test('uses BILLING_MODE precedence and rejects conflicting gateway modes', () => {
  const result = runDeployPreflight(
    validEnv({ BILLING_MODE: 'sandbox' }),
  );
  assert.equal(result.ok, false);
  assert.equal(result.billingMode, 'sandbox');
  assert.ok(result.errors.includes('BILLING_MODE_CONFLICT'));
  assert.ok(result.errors.includes('MERCADO_PAGO_PRODUCTION_MODE_REQUIRED'));
});

test('rejects loopback aliases even when HTTPS and CORS are otherwise valid', () => {
  for (const host of ['127.0.0.1', '[::1]', 'localhost.', 'api.localhost']) {
    const url = `https://${host}`;
    const result = runDeployPreflight(
      validEnv({
        PUBLIC_APP_URL: url,
        CORS_ALLOWED_ORIGINS: url,
      }),
    );
    assert.equal(result.ok, false, host);
    assert.ok(result.errors.includes('PUBLIC_APP_URL_HOST_INVALID'), host);
  }
});
