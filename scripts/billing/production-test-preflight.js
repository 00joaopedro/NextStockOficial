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

function planOwnerId(plan) {
  const owner =
    plan.collector_id ||
    plan.collector?.id ||
    plan.user_id ||
    plan.payer_id ||
    null;
  return owner === null || owner === undefined ? null : String(owner);
}

function validatePlan(plan, expectedCollectorId) {
  const recurring =
    plan.auto_recurring && typeof plan.auto_recurring === 'object'
      ? plan.auto_recurring
      : {};
  const amountCents = Math.round(Number(recurring.transaction_amount) * 100);
  const currency = String(recurring.currency_id || '').toUpperCase();
  const status = String(plan.status || '').toLowerCase();
  const ownerId = planOwnerId(plan);
  const failures = [];

  if (!plan.id) failures.push('Plano retornado sem id.');
  if (status && status !== 'active') {
    failures.push(`Plano recorrente não está ativo (status=${sanitizeText(status, 40)}).`);
  }
  if (!Number.isFinite(amountCents) || amountCents !== 100) {
    failures.push('Plano deve cobrar exatamente R$ 1,00.');
  }
  if (currency !== 'BRL') failures.push('Plano deve usar moeda BRL.');
  if (!Number.isInteger(Number(recurring.frequency)) || Number(recurring.frequency) < 1) {
    failures.push('Plano recorrente sem frequência válida.');
  }
  if (!recurring.frequency_type) {
    failures.push('Plano recorrente sem unidade de frequência válida.');
  }
  if (ownerId && ownerId !== expectedCollectorId) {
    failures.push('Plano pertence a outro recebedor Mercado Pago.');
  }

  return {
    ok: failures.length === 0,
    failures,
    plan: {
      id: String(plan.id || ''),
      status: status || 'not_returned',
      amountCents: Number.isFinite(amountCents) ? amountCents : null,
      currency: currency || null,
      frequency: Number.isInteger(Number(recurring.frequency))
        ? Number(recurring.frequency)
        : null,
      frequencyType: recurring.frequency_type || null,
      ownerValidated: ownerId !== null,
    },
  };
}

async function runPreflight(env = process.env, fetchImpl = fetch) {
  if (effectiveMode(env) !== 'production') {
    throw new Error('Pré-validação bloqueada: o modo efetivo precisa ser production.');
  }
  if (env.BILLING_PRODUCTION_TEST_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('Pré-validação bloqueada: BILLING_PRODUCTION_TEST_ENABLED precisa ser true.');
  }

  const token = required('MERCADO_PAGO_ACCESS_TOKEN', env);
  const configuredCollectorId = required('MERCADO_PAGO_COLLECTOR_ID', env);
  const planId = required('MERCADO_PAGO_PRODUCTION_TEST_PLAN_ID', env);
  const account = await mercadoPagoGet('/users/me', token, fetchImpl);
  const accountId = String(account.id || '');
  if (!accountId) throw new Error('Mercado Pago retornou a conta sem identificador.');
  if (accountId !== configuredCollectorId) {
    throw new Error(
      'Token Mercado Pago não pertence ao MERCADO_PAGO_COLLECTOR_ID configurado.',
    );
  }

  const plan = await mercadoPagoGet(
    `/preapproval_plan/${encodeURIComponent(planId)}`,
    token,
    fetchImpl,
  );
  const validation = validatePlan(plan, configuredCollectorId);
  if (!validation.ok) throw new Error(validation.failures.join(' '));

  return {
    ok: true,
    action: 'production_test_checkout_preflight',
    provider: 'MERCADO_PAGO',
    mode: 'production',
    collectorId: configuredCollectorId,
    ...validation,
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

module.exports = { runPreflight, validatePlan, sanitizeText };
