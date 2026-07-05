import {
  EmployeeRole,
  EmployeeStatus,
  OrderPaymentMethod,
  OrderStatus,
  Role,
  SaleSource,
  SaleStatus,
  SubscriptionStatus,
  SystemMode,
  SystemType,
} from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const unique = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

export async function createTenant(
  prisma: PrismaClient,
  input: { systemType?: SystemType; mode?: SystemMode; name?: string } = {},
) {
  const systemType = input.systemType ?? SystemType.padrao;
  return prisma.tenant.create({
    data: {
      name: input.name ?? unique('Tenant'),
      slug: unique('tenant'),
      systemType,
      mode:
        input.mode ??
        (systemType === SystemType.petshop
          ? SystemMode.petshop
          : SystemMode.padrao),
    },
  });
}

export async function createBranch(
  prisma: PrismaClient,
  tenant: { id: string },
  input: { name?: string; isDefault?: boolean } = {},
) {
  return prisma.branch.create({
    data: {
      tenantId: tenant.id,
      name: input.name ?? unique('Filial'),
      slug: unique('branch'),
      isDefault: input.isDefault ?? false,
      isActive: true,
    },
  });
}

export async function createProfile(
  prisma: PrismaClient,
  input: { role?: Role; tenantId?: string; email?: string } = {},
) {
  const id = randomUUID();
  const email = input.email ?? `${unique('user')}@test.local`;
  return prisma.userProfile.create({
    data: {
      id,
      supabaseUserId: id,
      email,
      name: unique('User'),
      accessNameNormalized: unique('access'),
      role: input.role ?? Role.Comprador,
      tenantId: input.tenantId,
      primaryTenantId: input.tenantId,
      isSuperAdmin: input.role === Role.superAdmin,
    },
  });
}

export async function createMembership(
  prisma: PrismaClient,
  profile: { id: string },
  tenant: { id: string },
  branch: { id: string },
  role: Role,
) {
  return prisma.tenantMember.create({
    data: {
      userProfileId: profile.id,
      tenantId: tenant.id,
      branchId: branch.id,
      role,
    },
  });
}

export async function createEmployee(
  prisma: PrismaClient,
  input: {
    profile: { id: string; email: string };
    tenant: { id: string };
    branch: { id: string };
    employeeRole?: EmployeeRole;
  },
) {
  return prisma.employee.create({
    data: {
      profileId: input.profile.id,
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      fullName: unique('Employee'),
      email: input.profile.email,
      jobTitle: 'Teste',
      employeeRole: input.employeeRole ?? EmployeeRole.funcionario,
      status: EmployeeStatus.active,
    },
  });
}

export async function createProduct(
  prisma: PrismaClient,
  input: { tenant: { id: string }; branch: { id: string }; sku?: string },
) {
  return prisma.product.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      name: unique('Product'),
      costPriceCents: 100,
      profitPercent: 50,
      salePriceCents: 150,
      quantity: 10,
      sku: input.sku ?? unique('SKU'),
    },
  });
}

export async function createOrder(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    branch: { id: string };
    profile?: { id: string };
  },
) {
  return prisma.order.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      customerName: unique('Customer'),
      status: OrderStatus.pending,
      paymentMethod: OrderPaymentMethod.pix,
      subtotalCents: 100,
      discountCents: 0,
      totalCents: 100,
      createdById: input.profile?.id,
    },
  });
}

export async function createSale(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    branch: { id: string };
    profile?: { id: string };
    idempotencyKey?: string;
  },
) {
  return prisma.sale.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      sellerId: input.profile?.id,
      sellerNameSnapshot: 'Security Test Seller',
      paymentMethod: 'pix',
      status: SaleStatus.paid,
      source: SaleSource.cash_register,
      subtotalCents: 100,
      discountCents: 0,
      totalCents: 100,
      idempotencyKey: input.idempotencyKey ?? randomUUID(),
    },
  });
}

export async function createExpense(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    branch: { id: string };
    profile?: { id: string };
  },
) {
  return prisma.expense.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      employeeName: 'Security Test Employee',
      storeName: 'Security Test Store',
      totalCents: 100,
      date: new Date(),
      type: 'written',
      status: 'pending',
      createdById: input.profile?.id,
    },
  });
}

export async function createPetClient(
  prisma: PrismaClient,
  input: { tenant: { id: string }; branch: { id: string } },
) {
  return prisma.petClient.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      name: unique('Pet Client'),
      phone: '11999999999',
    },
  });
}

export async function createPet(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    branch: { id: string };
    client: { id: string };
  },
) {
  return prisma.pet.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      clientId: input.client.id,
      name: unique('Pet'),
      species: 'dog',
    } as any,
  });
}

export async function createAppointment(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    branch: { id: string };
    client: { id: string };
    pet: { id: string };
  },
) {
  return prisma.agendaPet.create({
    data: {
      tenantId: input.tenant.id,
      branchId: input.branch.id,
      clientId: input.client.id,
      petId: input.pet.id,
      cliente: unique('Pet Client'),
      animal: unique('Pet'),
      atendente: 'Security Test',
      servico: 'Security Test Service',
      data: new Date(Date.now() + 3600000),
      hora: '10:00',
      preco: 100,
      startAt: new Date(Date.now() + 3600000),
      endAt: new Date(Date.now() + 7200000),
    },
  });
}

export async function createSubscription(
  prisma: PrismaClient,
  input: { tenant: { id: string }; plan?: { id: string } },
) {
  return prisma.subscription.create({
    data: {
      tenantId: input.tenant.id,
      planId: input.plan?.id,
      status: SubscriptionStatus.trialing,
      trialEndsAt: new Date(Date.now() + 86400000),
    },
  });
}

export async function createCheckout(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    plan: { id: string; priceCents: number; currency: string };
    profile?: { id: string };
  },
) {
  return prisma.checkoutSession.create({
    data: {
      tenantId: input.tenant.id,
      planId: input.plan.id,
      createdById: input.profile?.id,
      provider: 'MERCADO_PAGO',
      externalReference: randomUUID(),
      amountCents: input.plan.priceCents,
      currency: input.plan.currency,
    } as any,
  });
}

export async function createBillingPayment(
  prisma: PrismaClient,
  input: {
    tenant: { id: string };
    plan: { id: string; priceCents: number; currency: string };
  },
) {
  return prisma.billingPayment.create({
    data: {
      tenantId: input.tenant.id,
      planId: input.plan.id,
      provider: 'MERCADO_PAGO',
      gatewayPaymentId: unique('payment'),
      externalReference: randomUUID(),
      amountCents: input.plan.priceCents,
      currency: input.plan.currency,
      status: 'PENDING',
    } as any,
  });
}
