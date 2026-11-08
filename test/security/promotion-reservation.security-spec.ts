import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AdminOperationService } from '../../src/admin-operations/admin-operation.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { PromotionsService } from '../../src/promotions/promotions.service';
import {
  assertSafeTestDatabaseUrl,
  hasSecurityTestDatabase,
} from '../helpers/test-database.guard';

const suite =
  hasSecurityTestDatabase() || process.env.CI === 'true'
    ? describe
    : describe.skip;
suite('promotion reservation on PostgreSQL', () => {
  let db: PrismaClient;
  beforeAll(() => {
    db = new PrismaClient({
      datasourceUrl: assertSafeTestDatabaseUrl(
        process.env.SECURITY_TEST_DATABASE_URL,
      ),
    });
  });
  afterAll(async () => {
    await db?.$disconnect();
  });

  it('recovers an existing signup, binds its referral, and updates capacity and conversion with UUIDs', async () => {
    const rollback = new Error('rollback test fixture');
    await expect(
      db.$transaction(
        async (tx) => {
          // All real PostgreSQL operations share the isolated rollback transaction.
          const prisma = new Proxy(tx, {
            get(target, key, receiver) {
              if (key === '$transaction')
                return (action: (client: typeof tx) => Promise<unknown>) =>
                  action(target);
              return Reflect.get(target, key, receiver) as unknown;
            },
          }) as unknown as PrismaService;
          const promotions = new PromotionsService(
            prisma,
            new AdminOperationService(prisma),
          );
          const slug = 'lancamento-2026';
          const campaign = await tx.promotionCampaign.update({
            where: { slug },
            data: {
              status: 'ACTIVE',
              startsAt: null,
              endsAt: null,
              reservedCount: 0,
              convertedCount: 0,
              maxConversions: 30,
            },
          });
          const key = randomUUID();
          const tenant = await tx.tenant.create({
            data: { name: 'Promo recovery', slug: `promo-${key}` },
          });
          const branch = await tx.branch.create({
            data: { name: 'Test', slug: 'test', tenantId: tenant.id },
          });
          const profile = await tx.userProfile.create({
            data: {
              id: randomUUID(),
              email: `promo-${key}@example.test`,
              name: 'Test',
              role: 'Admin',
              tenantId: tenant.id,
              accessNameNormalized: key,
            },
          });
          const partner = await tx.partner.create({
            data: {
              name: 'Partner',
              phone: '00000000000',
              bankNumber: '000',
              referralCode: key,
              referralCodeHash: key,
              referralCodePrefix: key.slice(0, 6),
              systemType: 'padrao',
              createdById: profile.id,
            },
          });
          await tx.partnerReferral.create({
            data: {
              partnerId: partner.id,
              referredTenantId: tenant.id,
              referredBranchId: branch.id,
              referredProfileId: profile.id,
              systemType: 'padrao',
            },
          });
          const trial = await tx.subscription.create({
            data: {
              tenantId: tenant.id,
              status: 'trialing',
              trialStartedAt: new Date(),
              trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
            },
          });
          const input = {
            slug,
            tenantId: tenant.id,
            planSlug: 'ouro',
            periodMonths: 1,
            idempotencyKey: key,
          };
          const reserved = await promotions.reserveForTenant(input);
          expect(reserved).toMatchObject({
            status: 'RESERVED',
            offer: { monthlyPriceCents: 10000, totalPriceCents: 10000 },
          });
          expect(
            await tx.promotionReservation.findUniqueOrThrow({
              where: { id: reserved.reservationId },
            }),
          ).toMatchObject({ partnerId: partner.id });
          const subscription = await tx.subscription.findUniqueOrThrow({
            where: { id: trial.id },
          });
          expect(
            subscription.trialEndsAt!.getTime() -
              subscription.trialStartedAt!.getTime(),
          ).toBe(86_400_000);
          expect((await promotions.reserveForTenant(input)).reservationId).toBe(
            reserved.reservationId,
          );
          expect(
            await tx.promotionCampaign.findUniqueOrThrow({
              where: { id: campaign.id },
            }),
          ).toMatchObject({ reservedCount: 1, convertedCount: 0 });
          await promotions.updateCapacity(slug, 31, `capacity-${key}`);
          await promotions.convertReservation(reserved.reservationId);
          expect(
            await tx.promotionCampaign.findUniqueOrThrow({
              where: { id: campaign.id },
            }),
          ).toMatchObject({
            maxConversions: 31,
            reservedCount: 0,
            convertedCount: 1,
          });
          throw rollback;
        },
        { timeout: 15_000 },
      ),
    ).rejects.toBe(rollback);
  });
});
