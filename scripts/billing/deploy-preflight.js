'use strict';

const WEBHOOK_PATH = '/api/billing/webhooks/mercado-pago';

function normalized(value) {
  return String(value || '').trim();
}

function enabled(value) {
  return normalized(value).toLowerCase() === 'true';
}

function isLoopbackHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host.startsWith('127.') ||
    host.startsWith('::ffff:127.')
  );
}

function effectiveBillingMode(env) {
  return normalized(env.BILLING_MODE || env.MERCADO_PAGO_MODE).toLowerCase();
}

function safeHttpsUrl(raw, name, errors) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') {
      errors.push(`${name}_HTTPS_REQUIRED`);
      return null;
    }
    if (url.username || url.password || isLoopbackHost(url.hostname)) {
      errors.push(`${name}_HOST_INVALID`);
      return null;
    }
    return url;
  } catch {
    errors.push(`${name}_INVALID`);
    return null;
  }
}

function required(env, name, errors, minimumLength = 1) {
  const value = normalized(env[name]);
  if (value.length < minimumLength) errors.push(`${name}_MISSING_OR_INVALID`);
}

function runDeployPreflight(env = process.env) {
  const errors = [];
  const appEnv = normalized(env.APP_ENV || env.NODE_ENV).toLowerCase();
  if (appEnv !== 'production') errors.push('PRODUCTION_ENV_REQUIRED');

  const publicAppUrl = safeHttpsUrl(
    normalized(env.PUBLIC_APP_URL),
    'PUBLIC_APP_URL',
    errors,
  );
  if (publicAppUrl && publicAppUrl.pathname !== '/') {
    errors.push('PUBLIC_APP_URL_ROOT_PATH_REQUIRED');
  }

  const expectedWebhookUrl = publicAppUrl
    ? new URL(WEBHOOK_PATH, publicAppUrl).toString()
    : null;
  const configuredWebhookUrl = normalized(env.MERCADO_PAGO_WEBHOOK_URL);
  if (configuredWebhookUrl) {
    const webhookUrl = safeHttpsUrl(
      configuredWebhookUrl,
      'MERCADO_PAGO_WEBHOOK_URL',
      errors,
    );
    if (webhookUrl && webhookUrl.toString() !== expectedWebhookUrl) {
      errors.push('MERCADO_PAGO_WEBHOOK_URL_MISMATCH');
    }
  }

  const origins = normalized(env.CORS_ALLOWED_ORIGINS)
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  if (!publicAppUrl || !origins.includes(publicAppUrl.origin)) {
    errors.push('CORS_PUBLIC_APP_URL_MISSING');
  }

  const productionHost = normalized(env.PRODUCTION_APP_HOST).toLowerCase();
  if (productionHost && publicAppUrl && publicAppUrl.hostname.toLowerCase() !== productionHost) {
    errors.push('PRODUCTION_APP_HOST_MISMATCH');
  }

  if (!enabled(env.BILLING_WEBHOOK_ENABLED)) {
    errors.push('BILLING_WEBHOOK_ENABLED_REQUIRED');
  }
  const billingMode = normalized(env.BILLING_MODE).toLowerCase();
  const mercadoPagoMode = normalized(env.MERCADO_PAGO_MODE).toLowerCase();
  if (billingMode && mercadoPagoMode && billingMode !== mercadoPagoMode) {
    errors.push('BILLING_MODE_CONFLICT');
  }
  if (effectiveBillingMode(env) !== 'production') {
    errors.push('MERCADO_PAGO_PRODUCTION_MODE_REQUIRED');
  }
  required(env, 'MERCADO_PAGO_ACCESS_TOKEN', errors);
  required(env, 'MERCADO_PAGO_WEBHOOK_SECRET', errors, 16);
  required(env, 'MERCADO_PAGO_COLLECTOR_ID', errors);
  required(env, 'BILLING_EXTERNAL_REFERENCE_SECRET', errors, 32);

  return {
    ok: errors.length === 0,
    action: 'billing_deploy_preflight',
    appEnv: appEnv || 'missing',
    billingMode: effectiveBillingMode(env) || 'missing',
    expectedWebhookUrl,
    configuredWebhookUrl: configuredWebhookUrl ? 'configured' : 'not_configured',
    errors,
  };
}

if (require.main === module) {
  const result = runDeployPreflight();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}

module.exports = { WEBHOOK_PATH, runDeployPreflight };
