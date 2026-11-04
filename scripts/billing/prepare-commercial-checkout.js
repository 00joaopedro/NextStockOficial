'use strict';

const SLUGS = ['ouro', 'esmeralda', 'diamante'];
function modeFor(env) {
  const mode = (env.BILLING_MODE?.trim() || env.MERCADO_PAGO_MODE?.trim() || 'production').toLowerCase();
  if (!['production', 'sandbox'].includes(mode)) throw new Error('INVALID_BILLING_MODE');
  if (env.MERCADO_PAGO_MODE && env.MERCADO_PAGO_MODE.trim().toLowerCase() !== mode)
    throw new Error('BILLING_GATEWAY_MODE_MISMATCH');
  return mode;
}
async function inspect(db, mode) {
  const plans = await db.plan.findMany({
    where: { slug: { in: SLUGS } },
    include: { gatewayMappings: { where: { provider: 'MERCADO_PAGO', mode } } },
  });
  return SLUGS.map(slug => {
    const plan = plans.find(p => p.slug === slug);
    return { slug, plan, ready: Boolean(plan?.isActive && !plan.deletedAt && plan.gatewayMappings.some(m => m.isActive)) };
  });
}
async function prepare(db, env, apply = false) {
  const mode = modeFor(env);
  const before = await inspect(db, mode);
  if (apply) {
    if (before.some(row => !row.plan?.isActive || row.plan.deletedAt))
      throw new Error('MISSING_OR_INACTIVE_PLAN_REQUIRES_REVIEW');
    await db.$transaction(async tx => {
      for (const row of before) {
        if (row.ready) continue;
        // Do not reactivate an intentionally disabled mapping.
        if (row.plan.gatewayMappings.length) throw new Error('INACTIVE_MAPPING_REQUIRES_REVIEW');
        await tx.gatewayPlanMapping.upsert({
          where: { planId_provider_mode: { planId: row.plan.id, provider: 'MERCADO_PAGO', mode } },
          update: {},
          create: { planId: row.plan.id, provider: 'MERCADO_PAGO', mode, isActive: true,
            gatewayPlanId: null, paymentLinkUrl: null, metadata: { correlationMode: 'recurring_preapproval' } },
        });
      }
    });
  }
  const result = apply ? await inspect(db, mode) : before;
  return { mode, applied: apply, ready: result.every(r => r.ready), plans: result.map(({ slug, ready }) => ({ slug, ready })) };
}
module.exports = { prepare, modeFor };
if (require.main === module) {
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  prepare(db, process.env, process.argv.includes('--apply'))
    .then(result => { console.log(JSON.stringify(result)); if (!result.ready) process.exitCode = 1; })
    .catch(() => { console.error('COMMERCIAL_CHECKOUT_CHECK_FAILED: confira planos ativos, modos e acesso ao banco; nenhum preço deve ser alterado.'); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
