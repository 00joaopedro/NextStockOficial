import { OrderSource, OrderStatus, Prisma, PrismaClient } from '@prisma/client';
import { assertMaintenanceEnvironment } from './guard';

async function main() {
  const state = assertMaintenanceEnvironment('storefront:cleanup');
  const prisma = new PrismaClient();
  const now = new Date();
  const candidates = await prisma.order.findMany({
    where: {
      source: OrderSource.storefront_guest,
      status: OrderStatus.pending,
      reservationExpiresAt: { lte: now },
      stockRestoredAt: null,
    },
    select: { id: true },
    take: 500,
  });
  let expired = 0;
  if (!state.dryRun) {
    for (const candidate of candidates) {
      await prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: candidate.id,
            status: OrderStatus.pending,
            stockRestoredAt: null,
          },
          include: { items: true },
        });
        if (!order) return;
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: OrderStatus.pending,
            stockRestoredAt: null,
          },
          data: {
            status: OrderStatus.canceled,
            canceledAt: now,
            cancellationReason: 'Reserva expirada',
            stockRestoredAt: now,
          },
        });
        if (changed.count !== 1) return;
        for (const item of order.items)
          await tx.product.updateMany({
            where: {
              id: item.productId,
              tenantId: order.tenantId,
              branchId: order.branchId,
            },
            data: { quantity: { increment: item.quantity } },
          });
        expired += 1;
      });
    }
  }
  const retentionCutoff = new Date(Date.now() - 30 * 86_400_000);
  const retentionWhere = {
    source: OrderSource.storefront_guest,
    createdAt: { lt: retentionCutoff },
    status: {
      in: [OrderStatus.canceled, OrderStatus.delivered, OrderStatus.refunded],
    },
  };
  const retentionCandidates = await prisma.order.count({
    where: retentionWhere,
  });
  const anonymized = state.dryRun
    ? 0
    : (
        await prisma.order.updateMany({
          where: retentionWhere,
          data: {
            customerName: 'Cliente removido',
            customerPhone: null,
            customerEmail: null,
            customerDocument: null,
            deliveryAddress: Prisma.JsonNull,
            notes: null,
            publicAccessTokenHash: null,
            idempotencyKeyHash: null,
            idempotencyRequestHash: null,
          },
        })
      ).count;
  console.log(
    JSON.stringify({
      ...state,
      reservationCandidates: candidates.length,
      expired,
      retentionCutoff,
      retentionCandidates,
      anonymized,
    }),
  );
  await prisma.$disconnect();
}
void main();
