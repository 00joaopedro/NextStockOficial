'use strict';

const {
  PrismaClient,
  PaymentGatewayProvider,
  PlanInterval,
} = require('@prisma/client');

const prisma = new PrismaClient();

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function validateProductionDatabaseTarget() {
  const appEnv = (
    process.env.APP_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    ''
  ).toLowerCase();

  if (appEnv !== 'production') {
    throw new Error(
      `Seed bloqueado: APP_ENV/NODE_ENV precisa ser production; recebido: ${appEnv || 'ausente'}`,
    );
  }

  const projectRef = required('SUPABASE_PROJECT_REF').toLowerCase();
  const productionProjectRef = required(
    'PRODUCTION_SUPABASE_PROJECT_REF',
  ).toLowerCase();

  if (projectRef !== productionProjectRef) {
    throw new Error(
      'Seed bloqueado: SUPABASE_PROJECT_REF não corresponde ao projeto Supabase de produção.',
    );
  }

  const databaseUrl = required('DATABASE_URL');
  assertDatabaseUrlIdentity(databaseUrl, projectRef, 'DATABASE_URL');

  const administrativeUrl =
    process.env.ADMIN_DATABASE_URL?.trim() || process.env.DIRECT_URL?.trim();

  if (!administrativeUrl) {
    throw new Error(
      'Seed bloqueado: DIRECT_URL ou ADMIN_DATABASE_URL é obrigatório em production.',
    );
  }

  assertDatabaseUrlIdentity(
    administrativeUrl,
    projectRef,
    process.env.ADMIN_DATABASE_URL?.trim()
      ? 'ADMIN_DATABASE_URL'
      : 'DIRECT_URL',
  );

  const parsedAdministrativeUrl = new URL(administrativeUrl);
  if (
    parsedAdministrativeUrl.port === '6543' ||
    parsedAdministrativeUrl.searchParams.get('pgbouncer')?.toLowerCase() ===
      'true'
  ) {
    throw new Error(
      'Seed bloqueado: a conexão administrativa não pode usar o pooler de transação.',
    );
  }
}

function assertDatabaseUrlIdentity(value, projectRef, variableName) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Seed bloqueado: ${variableName} não é uma URL PostgreSQL válida.`,
    );
  }

  if (!['postgresql:', 'postgres:'].includes(parsed.protocol)) {
    throw new Error(
      `Seed bloqueado: ${variableName} precisa usar o protocolo PostgreSQL.`,
    );
  }

  const identity = `${parsed.hostname}/${parsed.username}`.toLowerCase();
  if (!identity.includes(projectRef)) {
    throw new Error(
      `Seed bloqueado: ${variableName} não corresponde a SUPABASE_PROJECT_REF.`,
    );
  }
}

async function main() {
  validateProductionDatabaseTarget();

  const enabled =
    process.env.BILLING_PRODUCTION_TEST_ENABLED?.trim().toLowerCase();

  if (enabled !== 'true') {
    throw new Error(
      'Seed bloqueado: BILLING_PRODUCTION_TEST_ENABLED precisa ser true.',
    );
  }

  required('BILLING_PRODUCTION_TEST_ADMIN_EMAIL');

  const mode =
    process.env.BILLING_MODE?.trim() ||
    process.env.MERCADO_PAGO_MODE?.trim() ||
    'production';

  if (mode !== 'production') {
    throw new Error(
      `Seed bloqueado: o teste de produção exige modo production; recebido: ${mode}`,
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const plan = await tx.plan.upsert({
      where: { slug: 'production-test-r1' },
      update: {
        name: 'Validação de produção — R$ 1,00',
        priceCents: 100,
        description:
          'Plano técnico temporário para validar o webhook e a ativação de billing.',
        currency: 'BRL',
        interval: PlanInterval.MONTHLY,
        intervalCount: 1,
        sortOrder: 999,
        isActive: true,
        deletedAt: null,
      },
      create: {
        name: 'Validação de produção — R$ 1,00',
        slug: 'production-test-r1',
        priceCents: 100,
        description:
          'Plano técnico temporário para validar o webhook e a ativação de billing.',
        currency: 'BRL',
        interval: PlanInterval.MONTHLY,
        intervalCount: 1,
        sortOrder: 999,
        isActive: true,
      },
    });

    const mapping = await tx.gatewayPlanMapping.upsert({
      where: {
        planId_provider_mode: {
          planId: plan.id,
          provider: PaymentGatewayProvider.MERCADO_PAGO,
          mode,
        },
      },
      update: {
        gatewayPlanId: 'hosted-pending',
        paymentLinkUrl: null,
        isActive: true,
        metadata: {
          correlationMode: 'recurring_preapproval',
          purpose: 'production_test_r1',
        },
      },
      create: {
        planId: plan.id,
        provider: PaymentGatewayProvider.MERCADO_PAGO,
        mode,
        gatewayPlanId: 'hosted-pending',
        paymentLinkUrl: null,
        isActive: true,
        metadata: {
          correlationMode: 'recurring_preapproval',
          purpose: 'production_test_r1',
        },
      },
    });

    return { planId: plan.id, mappingId: mapping.id };
  });

  console.log(
    JSON.stringify({
      ok: true,
      action: 'production_test_plan_seeded',
      slug: 'production-test-r1',
      mode,
      provider: 'MERCADO_PAGO',
      planId: result.planId,
      mappingId: result.mappingId,
    }),
  );
}

main()
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Seed do teste de produção falhou: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
