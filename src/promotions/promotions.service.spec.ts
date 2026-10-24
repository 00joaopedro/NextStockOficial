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

  it('updates capacity atomically and records the administrative operation', async () => {
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
    const updated = { ...campaign, maxConversions: 50 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([campaign]),
      promotionCampaign: { update: jest.fn().mockResolvedValue(updated) },
      securityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const adminOperations = {
      execute: jest.fn(async (_input: unknown, action: any) => ({
        result: await action(tx),
        replayed: false,
      })),
    };
    const prisma = {
      promotionCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
    } as any;

    const result = await new PromotionsService(
      prisma,
      adminOperations as any,
    ).updateCapacity('lancamento-2026', 50, 'capacity-update-0001', {
      requestId: 'request-1',
      actorRole: 'DEV_SUPERADMIN',
    });

    expect(result).toMatchObject({
      replayed: false,
      reactivated: false,
      campaign: { maxConversions: 50 },
    });
    expect(adminOperations.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'PROMOTION_CAMPAIGN_CAPACITY_UPDATE',
        idempotencyKey: 'capacity-update-0001',
      }),
      expect.any(Function),
    );
    expect(tx.promotionCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ maxConversions: 50 }),
      }),
    );
    expect(tx.securityAuditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PROMOTION_CAMPAIGN_CAPACITY_UPDATE',
          requestId: 'request-1',
          metadata: expect.objectContaining({
            previousMaxConversions: 30,
            maxConversions: 50,
          }),
        }),
      }),
    );
  });

  it('rejects capacity below existing reservations and conversions', async () => {
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
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([campaign]),
      promotionCampaign: { update: jest.fn() },
      securityAuditEvent: { create: jest.fn() },
    };
    const adminOperations = {
      execute: jest.fn(async (_input: unknown, action: any) => ({
        result: await action(tx),
        replayed: false,
      })),
    };
    const prisma = {
      promotionCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
    } as any;

    await expect(
      new PromotionsService(prisma, adminOperations as any).updateCapacity(
        'lancamento-2026',
        4,
        'capacity-update-0002',
      ),
    ).rejects.toThrow('não pode ser menor que as 5 vaga');
    expect(tx.promotionCampaign.update).not.toHaveBeenCalled();
  });

  it('reopens an exhausted campaign only when increased capacity creates a vacancy', async () => {
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
    const updated = {
      ...campaign,
      status: PromotionCampaignStatus.ACTIVE,
      maxConversions: 31,
      closedAt: null,
      closeReason: null,
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([campaign]),
      promotionCampaign: { update: jest.fn().mockResolvedValue(updated) },
      securityAuditEvent: { create: jest.fn().mockResolvedValue({}) },
    };
    const adminOperations = {
      execute: jest.fn(async (_input: unknown, action: any) => ({
        result: await action(tx),
        replayed: false,
      })),
    };
    const prisma = {
      promotionCampaign: { findUnique: jest.fn().mockResolvedValue(campaign) },
    } as any;

    const result = await new PromotionsService(
      prisma,
      adminOperations as any,
    ).updateCapacity('lancamento-2026', 31, 'capacity-update-0003');

    expect(result.reactivated).toBe(true);
    expect(tx.promotionCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: PromotionCampaignStatus.ACTIVE,
          closedAt: null,
          closeReason: null,
        }),
      }),
    );
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
