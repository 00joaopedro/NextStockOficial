'use strict';

// Read-only support diagnostic. Never print provider payloads or database JSON.
const { PrismaClient } = require('@prisma/client');
const BASE = 'https://api.mercadopago.com';
const suffix = value => value == null ? null : `…${String(value).slice(-8)}`;
const safeStatus = value => typeof value === 'string' && /^[A-Za-z_]{1,40}$/.test(value) ? value : null;
const safeDate = value => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;

async function providerGet(path, token, fetchImpl = fetch) {
  try {
    const response = await fetchImpl(`${BASE}${path}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, httpStatus: response.status };
    const data = await response.json();
    return { ok: true, data };
  } catch (_) { return { ok: false, error: 'NETWORK_TIMEOUT_OR_INVALID_RESPONSE' }; }
}

async function investigate(prisma, tenantId, ids, token, fetchImpl = fetch) {
  const report = { version: 1, generatedAt: new Date().toISOString(), tenantIdSuffix: suffix(tenantId), payments: [] };
  for (const id of ids) {
    const remote = await providerGet(`/v1/payments/${id}`, token, fetchImpl);
    const entry = { paymentIdSuffix: suffix(id), provider: null, local: null };
    report.payments.push(entry);
    if (!remote.ok) { entry.provider = remote; continue; }
    const p = remote.data;
    const ref = typeof p.external_reference === 'string' ? p.external_reference : null;
    entry.provider = { ok: true, idMatches: String(p.id) === id, status: safeStatus(p.status), statusDetail: safeStatus(p.status_detail), amount: typeof p.transaction_amount === 'number' ? p.transaction_amount : null, currency: safeStatus(p.currency_id), externalReferenceSuffix: suffix(ref), createdAt: safeDate(p.date_created), approvedAt: safeDate(p.date_approved), lastUpdatedAt: safeDate(p.date_last_updated), refundedAmount: typeof p.transaction_amount_refunded === 'number' ? p.transaction_amount_refunded : null, refundCount: Array.isArray(p.refunds) ? p.refunds.length : null };
    if (!entry.provider.idMatches || !ref) { entry.local = { status: 'UNVERIFIED_PROVIDER_ID_OR_MISSING_REFERENCE' }; continue; }
    const checkout = await prisma.checkoutSession.findFirst({ where: { tenantId, externalReference: ref, provider: 'MERCADO_PAGO' }, select: { id: true, subscriptionId: true, gatewayCheckoutId: true, status: true, expectedAmountCents: true, currency: true, lastPaymentState: true, createdAt: true, completedAt: true } });
    if (!checkout) { entry.local = { status: 'CHECKOUT_NOT_FOUND_FOR_TENANT' }; continue; }
    const payments = await prisma.billingPayment.findMany({ where: { tenantId, checkoutSessionId: checkout.id }, select: { id: true, gatewayPaymentId: true, status: true, amountCents: true, currency: true, paidAt: true, refundedAt: true, providerOccurredAt: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: 'desc' }, take: 51 });
    const subscription = checkout.subscriptionId ? await prisma.subscription.findFirst({ where: { tenantId, id: checkout.subscriptionId }, select: { status: true, gatewaySubscriptionId: true, lastPaymentState: true, lastProviderEventAt: true, currentPeriodStartedAt: true, currentPeriodEndsAt: true, cancelAtPeriodEnd: true, updatedAt: true } }) : null;
    const events = await prisma.billingEvent.findMany({ where: { tenantId, ...(checkout.subscriptionId ? { subscriptionId: checkout.subscriptionId } : { checkoutSessionId: checkout.id }) }, select: { type: true, source: true, previousState: true, nextState: true, metadata: true, createdAt: true, checkoutSessionId: true }, orderBy: { createdAt: 'desc' }, take: 101 });
    const gatewaySub = subscription?.gatewaySubscriptionId || checkout.gatewayCheckoutId;
    let subscriptionRemote = { status: 'NO_SUBSCRIPTION_ID' };
    if (gatewaySub && /^[A-Za-z0-9_-]{1,100}$/.test(gatewaySub)) {
      const sr = await providerGet(`/preapproval/${encodeURIComponent(gatewaySub)}`, token, fetchImpl);
      subscriptionRemote = sr.ok ? { ok: true, idSuffix: suffix(sr.data.id), status: safeStatus(sr.data.status), externalReferenceMatches: sr.data.external_reference === ref } : sr;
    }
    const webhooks = await prisma.gatewayWebhookEvent.findMany({ where: { provider: 'MERCADO_PAGO', resourceId: id }, select: { eventType: true, signatureValid: true, processingStatus: true, failureCode: true, attemptCount: true, createdAt: true, processedAt: true }, orderBy: { createdAt: 'desc' }, take: 51 });
    let invoices = { status: 'NO_SUBSCRIPTION_ID' };
    if (gatewaySub && /^[A-Za-z0-9_-]{1,100}$/.test(gatewaySub)) {
      const result = await providerGet(`/authorized_payments/search?preapproval_id=${encodeURIComponent(gatewaySub)}&limit=20&offset=0`, token, fetchImpl);
      invoices = result.ok ? { ok: true, total: typeof result.data.paging?.total === 'number' ? result.data.paging.total : null, truncated: typeof result.data.paging?.total === 'number' ? result.data.paging.total > 20 : null, results: Array.isArray(result.data.results) ? result.data.results.slice(0, 20).map(i => ({ status: safeStatus(i.status), subscriptionMatches: i.preapproval_id === gatewaySub, paymentIdSuffix: suffix(i.payment?.id), matchesRequestedPayment: String(i.payment?.id) === id })) : [] } : result;
    }
    entry.local = { status: 'CHECKOUT_FOUND', providerInvoices: invoices, webhookEventsTruncated: webhooks.length > 50, webhookEvents: webhooks.slice(0, 50).map(w => ({ type: safeStatus(w.eventType), signatureValid: w.signatureValid, status: w.processingStatus, failureCode: safeStatus(w.failureCode), attempts: w.attemptCount, createdAt: w.createdAt, processedAt: w.processedAt })), checkout: { idSuffix: suffix(checkout.id), status: checkout.status, expectedAmountCents: checkout.expectedAmountCents, currency: checkout.currency, lastPaymentState: checkout.lastPaymentState, createdAt: checkout.createdAt, completedAt: checkout.completedAt }, subscription: subscription ? { status: subscription.status, gatewayIdSuffix: suffix(subscription.gatewaySubscriptionId), lastPaymentState: subscription.lastPaymentState, lastProviderEventAt: subscription.lastProviderEventAt, currentPeriodStartedAt: subscription.currentPeriodStartedAt, currentPeriodEndsAt: subscription.currentPeriodEndsAt, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd, updatedAt: subscription.updatedAt } : null, providerSubscription: subscriptionRemote, paymentsTruncated: payments.length > 50, payments: payments.slice(0,50).map(x => ({ idSuffix: suffix(x.id), gatewayPaymentIdSuffix: suffix(x.gatewayPaymentId), matchesRequestedPayment: x.gatewayPaymentId === id, status: x.status, amountCents: x.amountCents, currency: x.currency, paidAt: x.paidAt, refundedAt: x.refundedAt, providerOccurredAt: x.providerOccurredAt, createdAt: x.createdAt, updatedAt: x.updatedAt })), eventsTruncated: events.length > 100, events: events.slice(0,100).map(x => ({ type: x.type, source: safeStatus(x.source), checkoutMatches: x.checkoutSessionId === checkout.id, previousStatus: safeStatus(x.previousState?.status), nextStatus: safeStatus(x.nextState?.status), reason: safeStatus(x.metadata?.reason), applied: typeof x.metadata?.applied === 'boolean' ? x.metadata.applied : null, createdAt: x.createdAt })) };
  }
  return report;
}
async function main() {
  const tenantId = process.env.BILLING_DIAGNOSTIC_TENANT_ID || '';
  const ids = (process.env.BILLING_DIAGNOSTIC_PAYMENT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId) || !ids.length || ids.length > 5 || ids.some(id => !/^\d{1,30}$/.test(id)) || !token) throw new Error('INVALID_DIAGNOSTIC_CONFIGURATION');
  const prisma = new PrismaClient();
  try { console.log(JSON.stringify(await investigate(prisma, tenantId, ids, token), null, 2)); }
  finally { await prisma.$disconnect(); }
}
if (require.main === module) main().catch(() => { console.error('DIAGNOSTIC_FAILED: confira configuração e conexão; nenhum dado foi alterado.'); process.exitCode = 1; });
module.exports = { investigate, providerGet, suffix };
