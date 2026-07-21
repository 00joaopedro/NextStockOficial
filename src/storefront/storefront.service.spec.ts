/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/require-await */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorefrontStatus, SystemMode } from '@prisma/client';
import { StorefrontService } from './storefront.service';

describe('StorefrontService security boundaries', () => {
  const user = {
    id: 'user',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    role: 'Admin',
    mode: SystemMode.padrao,
  } as any;
  function setup() {
    const prisma: any = {
      storefront: { findUnique: jest.fn(), upsert: jest.fn() },
      storefrontSlugRedirect: { findUnique: jest.fn() },
      $transaction: jest.fn(async (fn: any) => fn(prisma)),
    };
    const tenancy: any = {
      resolve: jest
        .fn()
        .mockResolvedValue({ tenantId: 'tenant-a', branchId: 'branch-a' }),
    };
    const billing: any = { forTenant: jest.fn() };
    const storage: any = {};
    const audit: any = { record: jest.fn() };
    return {
      service: new StorefrontService(prisma, tenancy, billing, storage, audit),
      prisma,
      tenancy,
      billing,
    };
  }
  it('nao aceita branch do body diferente da filial autorizada', async () => {
    const { service } = setup();
    await expect(
      service.upsertAdmin(
        user,
        {
          branchId: '00000000-0000-4000-8000-000000000002',
          publicSlug: 'loja-segura',
          publicName: 'Loja',
          status: StorefrontStatus.draft,
          orderingEnabled: false,
          pickupEnabled: true,
          deliveryEnabled: true,
        },
        'branch-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('mantem storefront invisivel quando assinatura nao existe', async () => {
    const { service, prisma, billing } = setup();
    process.env.STOREFRONT_PUBLIC_READ_ENABLED = 'true';
    prisma.storefront.findUnique.mockResolvedValue({
      id: 'store',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      publicSlug: 'loja-segura',
      publicName: 'Loja',
      status: StorefrontStatus.active,
      orderingEnabled: true,
      pickupEnabled: true,
      deliveryEnabled: true,
      branch: { isActive: true },
    });
    billing.forTenant.mockResolvedValue({ allowed: true, subscription: null });
    await expect(service.getPublic('loja-segura')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('retorna somente identidade publica para assinatura ativa', async () => {
    const { service, prisma, billing } = setup();
    process.env.STOREFRONT_PUBLIC_READ_ENABLED = 'true';
    prisma.storefront.findUnique.mockResolvedValue({
      id: 'store',
      tenantId: 'tenant-a',
      branchId: 'branch-a',
      publicSlug: 'loja-segura',
      publicName: 'Loja',
      publicDescription: 'Publica',
      status: StorefrontStatus.active,
      orderingEnabled: true,
      pickupEnabled: true,
      deliveryEnabled: false,
      branch: { isActive: true },
    });
    billing.forTenant.mockResolvedValue({
      allowed: true,
      subscription: { id: 'subscription' },
    });
    await expect(service.getPublic('loja-segura')).resolves.toEqual({
      store: {
        slug: 'loja-segura',
        name: 'Loja',
        description: 'Publica',
        orderingEnabled: true,
        fulfillmentOptions: ['pickup'],
      },
    });
  });
});
