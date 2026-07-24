import { OrderPaymentMethod, OrderStatus, PaymentConnectionStatus, PaymentProviderCode } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

export async function createTenant(prisma: PrismaClient) {
  return prisma.tenant.create({ data: { name: `RC-001 tenant ${randomUUID()}`, slug: `rc001-${randomUUID()}` } });
}

export async function createBranch(prisma: PrismaClient, tenant: { id: string }) {
  return prisma.branch.create({ data: { tenantId: tenant.id, name: 'RC-001 branch', slug: `rc001-${randomUUID()}`, isActive: true, isDefault: true } });
}

export async function createOrder(prisma: PrismaClient, input: { tenant: { id: string }; branch: { id: string } }) {
  return prisma.order.create({ data: {
    tenantId: input.tenant.id, branchId: input.branch.id, customerName: 'RC-001 customer',
    subtotalCents: 100, discountCents: 0, totalCents: 100, paymentMethod: OrderPaymentMethod.pix, status: OrderStatus.pending,
  } });
}

export async function createConnection(prisma: PrismaClient, tenant: { id: string }) {
  return prisma.paymentConnection.create({ data: {
    tenantId: tenant.id, providerCode: PaymentProviderCode.MERCADO_PAGO,
    displayName: 'RC-001 fake provider', status: PaymentConnectionStatus.ACTIVE,
    encryptedCredentials: 'fake-encrypted-credentials', capabilities: ['PIX'], lastValidatedAt: new Date(),
  } });
}
