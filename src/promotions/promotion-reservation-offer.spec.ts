import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from './promotions.service';

describe('promotional reservation offer isolation', () => {
  const input = {
    slug: 'lancamento-2026',
    tenantId: 'tenant-1',
    planSlug: 'ouro',
    periodMonths: 6,
    idempotencyKey: 'reservation-attempt-1',
  };
  const active = {
    id: 'reservation-1',
    campaignId: 'campaign-1',
    tenantId: 'tenant-1',
    status: 'RESERVED',
    expiresAt: new Date(Date.now() + 60_000),
    convertedAt: null,
    metadata: { planSlug: 'ouro', periodMonths: 6 },
  };
  function fixture() {
    const tx = {
      promotionReservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'campaign-1' }]),
      subscription: { updateMany: jest.fn() },
    };
    const prisma = {
      promotionCampaign: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'campaign-1',
          slug: input.slug,
          trialDays: 1,
          startsAt: null,
          status: 'EXHAUSTED',
          reservedCount: 30,
          maxConversions: 30,
        }),
      },
      promotionReservation: { findUnique: jest.fn().mockResolvedValue(active) },
      tenant: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: input.tenantId, createdAt: new Date() }),
      },
      billingPayment: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn(
        async (callback: (value: typeof tx) => Promise<unknown>) =>
          callback(tx),
      ),
    };
    const service = new PromotionsService(prisma as unknown as PrismaService);
    jest
      .spyOn(
        service as unknown as { expireReservations(id: string): Promise<void> },
        'expireReservations',
      )
      .mockResolvedValue(undefined);
    return { service, prisma, tx };
  }

  it.each(['RESERVED', 'CONVERTED'])(
    'reuses the same offer in %s even when capacity is exhausted',
    async (status) => {
      const f = fixture();
      f.prisma.promotionReservation.findUnique.mockResolvedValue({
        ...active,
        status,
      });
      await expect(f.service.reserveForTenant(input)).resolves.toMatchObject({
        reservationId: active.id,
        status,
      });
      expect(f.prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each([
    { planSlug: 'esmeralda', periodMonths: 6 },
    { planSlug: 'ouro', periodMonths: 3 },
    null,
    [],
    {},
    { planSlug: 'ouro', periodMonths: '6' },
  ])('rejects a different or unverified offer: %j', async (metadata) => {
    const f = fixture();
    f.prisma.promotionReservation.findUnique.mockResolvedValue({
      ...active,
      metadata,
    } as typeof active);
    const error = await f.service
      .reserveForTenant(input)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      code: 'PROMOTION_RESERVATION_OFFER_MISMATCH',
    });
    expect(f.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects changing an already converted offer', async () => {
    const f = fixture();
    f.prisma.promotionReservation.findUnique.mockResolvedValue({
      ...active,
      status: 'CONVERTED',
    });
    await expect(
      f.service.reserveForTenant({ ...input, planSlug: 'esmeralda' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it.each([true, false])(
    'compares the winning offer during expired reservation recycling (same=%s)',
    async (same) => {
      const f = fixture();
      f.prisma.promotionReservation.findUnique.mockResolvedValue({
        ...active,
        status: 'EXPIRED',
      });
      f.tx.promotionReservation.findUnique.mockResolvedValue({
        ...active,
        metadata: { planSlug: same ? 'ouro' : 'esmeralda', periodMonths: 6 },
      });
      const result = f.service.reserveForTenant(input);
      if (same)
        await expect(result).resolves.toMatchObject({
          reservationId: active.id,
        });
      else await expect(result).rejects.toBeInstanceOf(ConflictException);
      expect(f.tx.$queryRaw).not.toHaveBeenCalled();
      expect(f.tx.subscription.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each(['same', 'different', 'expired'])(
    'handles a unique constraint race with a %s reservation',
    async (kind) => {
      const f = fixture();
      f.prisma.promotionReservation.findUnique
        .mockResolvedValueOnce(null as never)
        .mockResolvedValueOnce({
          ...active,
          status: kind === 'expired' ? 'EXPIRED' : 'RESERVED',
          metadata: {
            planSlug: kind === 'different' ? 'esmeralda' : 'ouro',
            periodMonths: 6,
          },
        });
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'duplicate',
        { code: 'P2002', clientVersion: 'test' },
      );
      f.prisma.$transaction.mockRejectedValueOnce(uniqueError);
      const result = f.service.reserveForTenant(input);
      if (kind === 'same')
        await expect(result).resolves.toMatchObject({
          reservationId: active.id,
        });
      else if (kind === 'different')
        await expect(result).rejects.toBeInstanceOf(ConflictException);
      else await expect(result).rejects.toBe(uniqueError);
      expect(f.prisma.promotionReservation.findUnique).toHaveBeenLastCalledWith(
        {
          where: {
            campaignId_tenantId: {
              campaignId: active.campaignId,
              tenantId: input.tenantId,
            },
          },
        },
      );
    },
  );
});
