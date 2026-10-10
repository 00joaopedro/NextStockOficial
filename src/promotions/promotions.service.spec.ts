import {
  PromotionCampaignStatus,
  PromotionReservationStatus,
} from '@prisma/client';
import { PromotionsService } from './promotions.service';

describe('PromotionsService', () => {
  it('reports an active campaign with remaining slots', async () => {
    const prisma = {
      promotionCampaign: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({
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
          })
          .mockResolvedValueOnce({
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
          }),
      },
      promotionReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      $transaction: jest.fn(async (callback: any) =>
        callback({
          promotionReservation: { updateMany: jest.fn() },
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
    const prisma = {
      promotionCampaign: {
        findUnique: jest.fn().mockResolvedValue({
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
        }),
      },
    } as any;

    const result = await new PromotionsService(prisma).getPublicContext(
      'lancamento-2026',
    );

    expect(result.isOpen).toBe(false);
    await expect(new PromotionsService(prisma).activate('lancamento-2026')).rejects.toThrow(
      'Campanha esgotada',
    );
  });

  it('exposes reservation states for the next billing PR', () => {
    expect(PromotionReservationStatus.RESERVED).toBe('RESERVED');
    expect(PromotionReservationStatus.CONVERTED).toBe('CONVERTED');
  });
});
