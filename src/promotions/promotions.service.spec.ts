import {
  PromotionCampaignStatus,
  PromotionReservationStatus,
} from '@prisma/client';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('reports an active campaign with remaining slots', async () => {
    const campaign = {
      id: 'campaign-1',
      slug: 'lancamento-2026',
      name: 'Lançamento NextStock',
      status: PromotionCampaignStatus.ACTIVE,
      maxConversions: 30,
      reservedCount: 2,
      convertedCount: 3,
      trialDays: 1,
      startsAt: null,
      endsAt: null,
      closedAt: null,
      closeReason: null,
    };
    const prisma = {
      promotionCampaign: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(campaign)
          .mockResolvedValueOnce(campaign),
        findUniqueOrThrow: jest.fn().mockResolvedValue(campaign),
      },
      promotionReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(0),
          promotionReservation: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          promotionCampaign: { updateMany: jest.fn() },
        }),
      ),
      billingPayment: { count: jest.fn() },
      tenant: { findUnique: jest.fn() },
    } as any;

    const result = await new PromotionsService(prisma).getPublicContext(
      'lancamento-2026',
    );

    expect(result.isOpen).toBe(true);
    expect(result.remainingSlots).toBe(25);
    expect(result.trialDays).toBe(1);
    expect(result.status).toBe(PromotionCampaignStatus.ACTIVE);
  });

  it('does not reopen an exhausted campaign', async () => {
    const campaign = {
      id: 'campaign-1',
      slug: 'lancamento-2026',
      name: 'Lançamento NextStock',
      status: PromotionCampaignStatus.EXHAUSTED,
      maxConversions: 30,
      reservedCount: 0,
      convertedCount: 30,
      trialDays: 1,
      startsAt: null,
      endsAt: null,
      closedAt: new Date(),
      closeReason: 'LIMIT_REACHED',
    };
    const prisma = {
      promotionCampaign: {
        findUnique: jest.fn().mockResolvedValue(campaign),
        findUniqueOrThrow: jest.fn().mockResolvedValue(campaign),
      },
      promotionReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          $executeRaw: jest.fn().mockResolvedValue(0),
          promotionReservation: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
          promotionCampaign: { updateMany: jest.fn() },
        }),
      ),
    } as any;

    const result = await new PromotionsService(prisma).getPublicContext(
      'lancamento-2026',
    );

    expect(result.isOpen).toBe(false);
    await expect(
      new PromotionsService(prisma).activate('lancamento-2026'),
    ).rejects.toThrow('Campanha esgotada');
  });

  it('exposes reservation states for the next billing PR', () => {
    expect(PromotionReservationStatus.RESERVED).toBe('RESERVED');
    expect(PromotionReservationStatus.CONVERTED).toBe('CONVERTED');
  });

  it('uses active hosted-checkout mappings instead of legacy plan ID variables', async () => {
    process.env = {
      ...originalEnv,
      BILLING_DEFAULT_PROVIDER: 'MERCADO_PAGO',
      BILLING_MODE: 'production',
      BILLING_CHECKOUT_ENABLED: 'true',
      BILLING_WEBHOOK_ENABLED: 'true',
      BILLING_ENFORCEMENT_ENABLED: 'true',
      PUBLIC_APP_URL: 'https://app.example.test',
      BILLING_EXTERNAL_REFERENCE_SECRET: 'secret',
      MERCADO_PAGO_ACCESS_TOKEN: 'token',
      MERCADO_PAGO_WEBHOOK_SECRET: 'webhook-secret',
      MERCADO_PAGO_COLLECTOR_ID: 'collector',
      MERCADO_PAGO_MODE: 'production',
      MERCADO_PAGO_PLAN_ID_OURO: '',
      MERCADO_PAGO_PROMO_PLAN_ID_OURO_3: '',
    };
    const prisma = {
      gatewayPlanMapping: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { plan: { slug: 'ouro' } },
            { plan: { slug: 'esmeralda' } },
            { plan: { slug: 'diamante' } },
          ]),
      },
    } as any;

    const validation = await new PromotionsService(
      prisma,
    ).validateProductionConfiguration();

    expect(validation.ok).toBe(true);
    expect(validation.configuration.normalPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planSlug: 'ouro',
          env: 'gateway_plan_mappings:ouro',
          configured: true,
        }),
      ]),
    );
    expect(validation.configuration.promotionalPlans).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          planSlug: 'ouro',
          periodMonths: 3,
          configured: true,
        }),
      ]),
    );
  });
});
