import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, Role, SystemMode, SystemType } from '@prisma/client';
import { DashboardService, resolveDashboardPeriod } from './dashboard.service';

describe('resolveDashboardPeriod', () => {
  const now = new Date('2026-06-23T15:00:00.000Z');

  it('calcula hoje', () => {
    const period = resolveDashboardPeriod({ preset: 'today' }, now);
    expect(period.from).toEqual(new Date(2026, 5, 23));
    expect(period.to).toEqual(new Date(2026, 5, 24));
  });

  it('calcula ultimos 7 dias', () => {
    const period = resolveDashboardPeriod({ preset: 'last7days' }, now);
    expect(period.from).toEqual(new Date(2026, 5, 17));
    expect(period.to).toEqual(new Date(2026, 5, 24));
  });

  it('calcula este mes', () => {
    const period = resolveDashboardPeriod({ preset: 'currentMonth' }, now);
    expect(period.from).toEqual(new Date(2026, 5, 1));
    expect(period.to).toEqual(new Date(2026, 6, 1));
  });

  it('calcula mes passado', () => {
    const period = resolveDashboardPeriod({ preset: 'previousMonth' }, now);
    expect(period.from).toEqual(new Date(2026, 4, 1));
    expect(period.to).toEqual(new Date(2026, 5, 1));
  });

  it('exige datas no personalizado', () => {
    expect(() => resolveDashboardPeriod({ preset: 'custom' }, now)).toThrow(
      BadRequestException,
    );
  });

  it('limita intervalo maximo', () => {
    expect(() =>
      resolveDashboardPeriod({
        preset: 'custom',
        from: '2024-01-01',
        to: '2026-01-01',
      }),
    ).toThrow(BadRequestException);
  });
});

describe('DashboardService', () => {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    role: Role.Admin,
    roles: [Role.Admin],
  } as any;

  const context = {
    userId: user.id,
    tenantId: '22222222-2222-2222-2222-222222222222',
    branchId: '33333333-3333-3333-3333-333333333333',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
    contextKind: 'normal',
  };

  function makeService(contextOverride: Record<string, unknown> = {}) {
    const prisma: any = {
      $queryRaw: jest.fn(),
      product: {
        findFirst: jest.fn(),
      },
      expense: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      agendaPet: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue({ ...context, ...contextOverride }),
    } as any;
    return {
      service: new DashboardService(prisma, tenantContext),
      prisma,
      tenantContext,
    };
  }

  it('calcula summary em centavos, lucro liquido e ticket medio', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          gross_revenue_cents: BigInt(10000),
          sales_count: BigInt(4),
          total_cost_cents: BigInt(6000),
        },
      ])
      .mockResolvedValueOnce([{ value: BigInt(1500) }]);

    await expect(service.getSummary(user, { preset: 'today' })).resolves.toMatchObject({
      grossRevenueCents: 10000,
      totalExpensesCents: 1500,
      grossProfitCents: 4000,
      netProfitCents: 2500,
      averageTicketCents: 2500,
      salesCount: 4,
    });
  });

  it('usa fallback seguro quando nao ha snapshot de custo', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          gross_revenue_cents: 7000,
          sales_count: 2,
          total_cost_cents: 0,
        },
      ])
      .mockResolvedValueOnce([{ value: 1000 }]);

    await expect(service.getSummary(user, {})).resolves.toMatchObject({
      grossProfitCents: 7000,
      netProfitCents: 6000,
      costSnapshotCoverage: expect.objectContaining({
        hasCostSnapshot: false,
      }),
    });
  });

  it('retorna despesas restritas para vendedor', async () => {
    const { service, prisma } = makeService({ role: Role.Vendedor });
    prisma.$queryRaw.mockResolvedValueOnce([
      {
        gross_revenue_cents: 5000,
        sales_count: 1,
        total_cost_cents: 2000,
      },
    ]);

    await expect(service.getSummary(user, {})).resolves.toMatchObject({
      grossRevenueCents: 5000,
      totalExpensesCents: null,
      netProfitCents: null,
      permissions: { canSeeFinancial: false },
    });
  });

  it('usa status forecast incluindo pendente/aprovada/paga', async () => {
    const { service, prisma } = makeService();
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          gross_revenue_cents: 1000,
          sales_count: 1,
          total_cost_cents: 500,
        },
      ])
      .mockResolvedValueOnce([{ value: 300 }]);

    await service.getSummary(user, { statusMode: 'forecast' });

    expect((service as any).expenseStatuses('forecast')).toEqual([
      ExpenseStatus.pending,
      ExpenseStatus.approved,
      ExpenseStatus.paid,
    ]);
    expect((service as any).expenseStatuses('confirmed')).toEqual([
      ExpenseStatus.approved,
      ExpenseStatus.paid,
    ]);
  });

  it('calcula produto especifico e sharePercentage', async () => {
    const { service, prisma } = makeService();
    prisma.product.findFirst.mockResolvedValueOnce({
      id: '44444444-4444-4444-4444-444444444444',
      name: 'Produto A',
    });
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          product_id: '44444444-4444-4444-4444-444444444444',
          product_name: 'Produto A',
          quantity_sold: BigInt(3),
          revenue_cents: BigInt(3000),
          gross_profit_cents: BigInt(1200),
        },
      ])
      .mockResolvedValueOnce([
        {
          gross_revenue_cents: BigInt(12000),
          sales_count: BigInt(4),
          total_cost_cents: BigInt(7000),
        },
      ])
      .mockResolvedValueOnce([{ value: BigInt(1000) }]);

    await expect(
      service.getProductMetrics(
        user,
        '44444444-4444-4444-4444-444444444444',
        {},
      ),
    ).resolves.toMatchObject({
      productName: 'Produto A',
      quantitySold: 3,
      revenueCents: 3000,
      totalRevenueCents: 12000,
      sharePercentage: 25,
    });
  });

  it('bloqueia produto fora do tenant/branch', async () => {
    const { service, prisma } = makeService();
    prisma.product.findFirst.mockResolvedValueOnce(null);

    await expect(
      service.getProductMetrics(user, '44444444-4444-4444-4444-444444444444', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
