'use strict';

const API_BASE_URL = 'https://api.mercadopago.com';

function required(name, env = process.env) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function effectiveMode(env = process.env) {
  return (
    env.BILLING_MODE?.trim() ||
    env.MERCADO_PAGO_MODE?.trim() ||
    'production'
  ).toLowerCase();
}

function sanitizeText(value, maxLength = 160) {
  return String(value ?? '')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^\p{L}\p{N} .,:_\-/]/gu, '_')
    .trim()
    .slice(0, maxLength);
}

function responseRequestId(response) {
  return (
    response.headers.get('x-request-id') ||
    response.headers.get('x-correlation-id') ||
    null
  );
}

async function mercadoPagoGet(path, token, fetchImpl = fetch) {
  const response = await fetchImpl(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = sanitizeText(
      body.message || body.error || body.cause?.[0]?.description,
    );
    const requestId = responseRequestId(response);
    throw new Error(
      `Mercado Pago recusou GET ${path}: status=${response.status}` +
        ` code=${sanitizeText(body.code || body.error || 'unknown', 80)}` +
        (providerMessage ? ` message=${providerMessage}` : '') +
        (requestId ? ` request_id=${requestId}` : ''),
    );
  }
  return body;
}

async function runPreflight(env = process.env, fetchImpl = fetch) {
  if (effectiveMode(env) !== 'production') {
    throw new Error(
      'Pré-validação bloqueada: o modo efetivo precisa ser production.',
    );
  }
  if (env.BILLING_PRODUCTION_TEST_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error(
      'Pré-validação bloqueada: BILLING_PRODUCTION_TEST_ENABLED precisa ser true.',
    );
  }

  const token = required('MERCADO_PAGO_ACCESS_TOKEN', env);
  const configuredCollectorId = required('MERCADO_PAGO_COLLECTOR_ID', env);
  const account = await mercadoPagoGet('/users/me', token, fetchImpl);
  const accountId = String(account.id || '');
  if (!accountId)
    throw new Error('Mercado Pago retornou a conta sem identificador.');
  if (accountId !== configuredCollectorId) {
    throw new Error(
      'Token Mercado Pago não pertence ao MERCADO_PAGO_COLLECTOR_ID configurado.',
    );
  }

  return {
    ok: true,
    action: 'production_test_checkout_preflight',
    provider: 'MERCADO_PAGO',
    mode: 'production',
    collectorId: configuredCollectorId,
    checkoutFlow: 'hosted_pending_preapproval',
  };
}

if (require.main === module) {
  runPreflight()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(
        `Pré-validação do teste de produção falhou: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      process.exitCode = 1;
    });
}

module.exports = { runPreflight, sanitizeText };
