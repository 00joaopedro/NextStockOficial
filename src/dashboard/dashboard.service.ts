import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  AgendaPetStatus,
  ExpenseStatus,
  Prisma,
  Role,
  SalePaymentStatus,
  SaleStatus,
  SystemType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { PerformanceCacheService } from '../performance/performance-cache.service';
import { DashboardFilterDto, DashboardPreset, DashboardStatusMode } from './dto/dashboard-filter.dto';

export type DashboardPeriod = {
  from: Date;
  to: Date;
  preset: DashboardPreset;
  timezone: string;
};

type DashboardContext = {
  userId: string;
  tenantId: string;
  branchId: string;
  role: Role;
  systemType: SystemType;
  isDevSuperAdmin: boolean;
};

type SummaryRaw = {
  gross_revenue_cents: bigint | number | null;
  sales_count: bigint | number | null;
  total_cost_cents: bigint | number | null;
};

type CentsRaw = {
  value: bigint | number | null;
};

type ChartRaw = {
  day: Date;
  value: bigint | number | null;
};

type TopProductRaw = {
  product_id: string | null;
  product_name: string;
  quantity_sold: bigint | number | null;
  revenue_cents: bigint | number | null;
  gross_profit_cents: bigint | number | null;
};

const DEFAULT_TIMEZONE = process.env.TZ || 'America/Sao_Paulo';
const MAX_RANGE_DAYS = 370;
const FINANCIAL_ROLES = new Set<Role>([Role.Admin, Role.superAdmin]);
const PRODUCT_ROLES = new Set<Role>([Role.Admin, Role.Vendedor, Role.Comprador, Role.superAdmin]);

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    @Optional() private readonly cache?: PerformanceCacheService,
  ) {}

  async getDashboard(
    user: AuthenticatedUser | undefined,
    query: DashboardFilterDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    const load = async () => {
      const [summary, charts, topProducts, alerts] = await Promise.all([
        this.getSummaryForContext(context, query),
        this.getChartsForContext(context, query),
        this.getTopProductsForContext(context, query),
        this.getAlertsForContext(context),
      ]);
      return { summary, charts, topProducts, alerts };
    };
    if (!this.cache) return load();

    const key = this.cache.dashboardKey({
      tenantId: context.tenantId,
      branchId: context.branchId,
      userId: context.userId,
      role: context.role,
      systemType: context.systemType,
      filters: {
        preset: query.preset ?? 'currentMonth',
        from: query.from ?? null,
        to: query.to ?? null,
        statusMode: query.statusMode ?? 'confirmed',
      },
    });
    const configuredTtl = Number(process.env.DASHBOARD_CACHE_TTL_MS || 5_000);
    const ttlMs =
      Number.isFinite(configuredTtl) && configuredTtl >= 1_000
        ? configuredTtl
        : 5_000;
    return this.cache.getOrSet(
      key,
      { tenantId: context.tenantId, branchId: context.branchId },
      ttlMs,
      load,
    );
  }

  async getSummary(
    user: AuthenticatedUser | undefined,
    query: DashboardFilterDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    return this.getSummaryForContext(context, query);
  }

  async getCharts(
    user: AuthenticatedUser | undefined,
    query: DashboardFilterDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    return this.getChartsForContext(context, query);
  }

  async getTopProducts(
    user: AuthenticatedUser | undefined,
    query: DashboardFilterDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    return this.getTopProductsForContext(context, query);
  }

  async getProductMetrics(
    user: AuthenticatedUser | undefined,
    productId: string,
    query: DashboardFilterDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    this.assertCanSeeProducts(context);
    const period = resolveDashboardPeriod(query);
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      select: { id: true, name: true },
    });
    if (!product) {
      throw new NotFoundException('Produto nao encontrado para esta filial.');
    }

    const [productMetrics] = await this.prisma.$queryRaw<Array<TopProductRaw>>`
      SELECT
        si.product_id,
        COALESCE(MAX(si.product_name_snapshot), ${product.name}) AS product_name,
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.total_price_cents), 0) AS revenue_cents,
        COALESCE(SUM(si.total_price_cents), 0) - COALESCE(SUM(si.total_cost_cents_snapshot), 0) AS gross_profit_cents
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = ${context.tenantId}::uuid
        AND s.branch_id = ${context.branchId}::uuid
        AND s.deleted_at IS NULL
        AND s.status = ${SaleStatus.paid}::"SaleStatus"
        AND s.sold_at >= ${period.from}
        AND s.sold_at < ${period.to}
        AND si.product_id = ${product.id}::uuid
      GROUP BY si.product_id
    `;
    const summary = await this.getSummaryForContext(context, query);
    const revenueCents = toNumber(productMetrics?.revenue_cents);
    const totalRevenueCents = summary.grossRevenueCents;

    return {
      productId: product.id,
      productName: productMetrics?.product_name ?? product.name,
      quantitySold: toNumber(productMetrics?.quantity_sold),
      revenueCents,
      grossProfitCents: toNumber(productMetrics?.gross_profit_cents),
      totalRevenueCents,
      sharePercentage:
        totalRevenueCents > 0
          ? Number(((revenueCents / totalRevenueCents) * 100).toFixed(2))
          : 0,
      period,
    };
  }

  async getAlerts(
    user: AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(user, selectedBranchId, devContextMode);
    return this.getAlertsForContext(context);
  }

  private async resolveContext(
    user: AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ): Promise<DashboardContext> {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      allowedRoles: [Role.Admin, Role.Vendedor, Role.Comprador],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });

    return {
      userId: context.userId,
      tenantId: context.tenantId,
      branchId: context.branchId!,
      role: context.role,
      systemType: context.systemType,
      isDevSuperAdmin: context.isDevSuperAdmin,
    };
  }

  private async getSummaryForContext(context: DashboardContext, query: DashboardFilterDto) {
    const period = resolveDashboardPeriod(query);
    const canSeeFinancial = this.canSeeFinancial(context);
    const salesSummaryPromise = this.prisma.$queryRaw<Array<SummaryRaw>>`
      WITH filtered_sales AS (
        SELECT id, total_cents
        FROM sales
        WHERE tenant_id = ${context.tenantId}::uuid
          AND branch_id = ${context.branchId}::uuid
          AND deleted_at IS NULL
          AND status = ${SaleStatus.paid}::"SaleStatus"
          AND sold_at >= ${period.from}
          AND sold_at < ${period.to}
      ),
      filtered_costs AS (
        SELECT si.sale_id, SUM(si.total_cost_cents_snapshot) AS total_cost_cents
        FROM sale_items si
        INNER JOIN filtered_sales fs ON fs.id = si.sale_id
        WHERE si.total_cost_cents_snapshot IS NOT NULL
        GROUP BY si.sale_id
      )
      SELECT
        COALESCE(SUM(fs.total_cents), 0) AS gross_revenue_cents,
        COUNT(*) AS sales_count,
        COALESCE(SUM(fc.total_cost_cents), 0) AS total_cost_cents
      FROM filtered_sales fs
      LEFT JOIN filtered_costs fc ON fc.sale_id = fs.id
    `;
    const expensesPromise = canSeeFinancial
      ? this.sumExpenses(context, period, query.statusMode ?? 'confirmed')
      : Promise.resolve(0);
    const [salesRows, totalExpensesCents] = await Promise.all([
      salesSummaryPromise,
      expensesPromise,
    ]);
    const [salesSummary] = salesRows;
    const grossRevenueCents = toNumber(salesSummary?.gross_revenue_cents);
    const salesCount = toNumber(salesSummary?.sales_count);
    const totalCostCents = toNumber(salesSummary?.total_cost_cents);
    const grossProfitCents = totalCostCents > 0 ? grossRevenueCents - totalCostCents : grossRevenueCents;
    const netProfitCents = grossProfitCents - totalExpensesCents;

    return {
      grossRevenueCents,
      totalExpensesCents: canSeeFinancial ? totalExpensesCents : null,
      grossProfitCents: canSeeFinancial ? grossProfitCents : null,
      netProfitCents: canSeeFinancial ? netProfitCents : null,
      averageTicketCents: salesCount > 0 ? Math.round(grossRevenueCents / salesCount) : 0,
      salesCount,
      totalCostCents: canSeeFinancial ? totalCostCents : null,
      costSnapshotCoverage: {
        hasCostSnapshot: totalCostCents > 0,
        rule:
          totalCostCents > 0
            ? 'Lucro bruto = receita - snapshots de custo gravados em SaleItem.'
            : 'Sem snapshot de custo confiavel no periodo; lucro bruto usa fallback receita bruta.',
      },
      permissions: {
        canSeeFinancial,
        canSeeProducts: PRODUCT_ROLES.has(context.role) || context.isDevSuperAdmin,
      },
      period,
    };
  }

  private async getChartsForContext(context: DashboardContext, query: DashboardFilterDto) {
    const period = resolveDashboardPeriod(query);
    const canSeeFinancial = this.canSeeFinancial(context);
    const revenueRows = await this.prisma.$queryRaw<Array<ChartRaw>>`
      SELECT date_trunc('day', sold_at)::date AS day, COALESCE(SUM(total_cents), 0) AS value
      FROM sales
      WHERE tenant_id = ${context.tenantId}::uuid
        AND branch_id = ${context.branchId}::uuid
        AND deleted_at IS NULL
        AND status = ${SaleStatus.paid}::"SaleStatus"
        AND sold_at >= ${period.from}
        AND sold_at < ${period.to}
      GROUP BY 1
      ORDER BY 1
    `;
    const expenseRows = canSeeFinancial
      ? await this.prisma.$queryRaw<Array<ChartRaw>>`
          SELECT date_trunc('day', date)::date AS day, COALESCE(SUM(total_cents), 0) AS value
          FROM expenses
          WHERE tenant_id = ${context.tenantId}::uuid
            AND branch_id = ${context.branchId}::uuid
            AND deleted_at IS NULL
            AND status IN (${Prisma.join(this.expenseStatuses(query.statusMode ?? 'confirmed').map((status) => Prisma.sql`${status}::"ExpenseStatus"`))})
            AND date >= ${period.from}
            AND date < ${period.to}
          GROUP BY 1
          ORDER BY 1
        `
      : [];

    const labels = eachLocalDay(period.from, period.to);
    const revenueByDay = toDayMap(revenueRows);
    const expenseByDay = toDayMap(expenseRows);
    const revenues = labels.map((label) => revenueByDay.get(label) ?? 0);
    const expenses = labels.map((label) => (canSeeFinancial ? expenseByDay.get(label) ?? 0 : 0));
    const net = labels.map((label, index) => revenues[index] - expenses[index]);

    return { labels, revenues, expenses: canSeeFinancial ? expenses : null, net: canSeeFinancial ? net : null, period };
  }

  private async getTopProductsForContext(context: DashboardContext, query: DashboardFilterDto) {
    this.assertCanSeeProducts(context);
    const period = resolveDashboardPeriod(query);
    const rows = await this.prisma.$queryRaw<Array<TopProductRaw>>`
      SELECT
        si.product_id,
        COALESCE(MAX(si.product_name_snapshot), 'Produto sem nome') AS product_name,
        COALESCE(SUM(si.quantity), 0) AS quantity_sold,
        COALESCE(SUM(si.total_price_cents), 0) AS revenue_cents,
        COALESCE(SUM(si.total_price_cents), 0) - COALESCE(SUM(si.total_cost_cents_snapshot), 0) AS gross_profit_cents
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.tenant_id = ${context.tenantId}::uuid
        AND s.branch_id = ${context.branchId}::uuid
        AND s.deleted_at IS NULL
        AND s.status = ${SaleStatus.paid}::"SaleStatus"
        AND s.sold_at >= ${period.from}
        AND s.sold_at < ${period.to}
      GROUP BY si.product_id
      ORDER BY quantity_sold DESC, revenue_cents DESC
      LIMIT 5
    `;

    return {
      items: rows.map((row) => ({
        productId: row.product_id,
        productName: row.product_name,
        quantitySold: toNumber(row.quantity_sold),
        revenueCents: toNumber(row.revenue_cents),
        grossProfitCents: this.canSeeFinancial(context) ? toNumber(row.gross_profit_cents) : null,
      })),
      period,
    };
  }

  private async getAlertsForContext(context: DashboardContext) {
    const canSeeFinancial = this.canSeeFinancial(context);
    const now = new Date();
    const todayStart = startOfLocalDay(now);
    const threeDays = new Date(todayStart);
    threeDays.setDate(threeDays.getDate() + 4);
    const upcomingExpenses = canSeeFinancial
      ? await this.prisma.expense.findMany({
          where: {
            tenantId: context.tenantId,
            branchId: context.branchId,
            deletedAt: null,
            status: ExpenseStatus.pending,
            date: { gte: todayStart, lt: threeDays },
          },
          select: {
            id: true,
            supplierNameSnapshot: true,
            storeName: true,
            totalCents: true,
            date: true,
            status: true,
          },
          orderBy: { date: 'asc' },
          take: 5,
        })
      : [];

    const upcomingAppointments =
      context.systemType === SystemType.petshop
        ? await this.prisma.agendaPet.findMany({
            where: {
              tenantId: context.tenantId,
              branchId: context.branchId,
              deletedAt: null,
              status: { not: AgendaPetStatus.canceled },
              startAt: { gte: todayStart, lt: new Date(todayStart.getTime() + 24 * 60 * 60 * 1000) },
            },
            select: {
              id: true,
              cliente: true,
              animal: true,
              servico: true,
              startAt: true,
              status: true,
            },
            orderBy: { startAt: 'asc' },
            take: 3,
          })
        : [];

    return {
      upcomingExpenses: upcomingExpenses.map((expense) => ({
        id: expense.id,
        name: expense.supplierNameSnapshot ?? expense.storeName,
        totalCents: expense.totalCents,
        dueDate: expense.date,
        status: expense.status,
        dueDateSource: 'Expense.date',
      })),
      upcomingAppointments,
      petshopEnabled: context.systemType === SystemType.petshop,
    };
  }

  private async sumExpenses(
    context: DashboardContext,
    period: DashboardPeriod,
    statusMode: DashboardStatusMode,
  ) {
    const [row] = await this.prisma.$queryRaw<Array<CentsRaw>>`
      SELECT COALESCE(SUM(total_cents), 0) AS value
      FROM expenses
      WHERE tenant_id = ${context.tenantId}::uuid
        AND branch_id = ${context.branchId}::uuid
        AND deleted_at IS NULL
        AND status IN (${Prisma.join(this.expenseStatuses(statusMode).map((status) => Prisma.sql`${status}::"ExpenseStatus"`))})
        AND date >= ${period.from}
        AND date < ${period.to}
    `;
    return toNumber(row?.value);
  }

  private expenseStatuses(statusMode: DashboardStatusMode) {
    if (statusMode === 'forecast') {
      return [ExpenseStatus.pending, ExpenseStatus.approved, ExpenseStatus.paid];
    }
    return [ExpenseStatus.approved, ExpenseStatus.paid];
  }

  private canSeeFinancial(context: DashboardContext) {
    return context.isDevSuperAdmin || FINANCIAL_ROLES.has(context.role);
  }

  private assertCanSeeProducts(context: DashboardContext) {
    if (!context.isDevSuperAdmin && !PRODUCT_ROLES.has(context.role)) {
      throw new BadRequestException('Usuario sem permissao para produtos no dashboard.');
    }
  }
}

export function resolveDashboardPeriod(
  query: Pick<DashboardFilterDto, 'preset' | 'from' | 'to'>,
  now = new Date(),
): DashboardPeriod {
  const preset = query.preset ?? 'currentMonth';
  let from: Date;
  let to: Date;

  if (preset === 'custom') {
    if (!query.from || !query.to) {
      throw new BadRequestException('Periodo personalizado exige from e to.');
    }
    from = startOfLocalDay(new Date(query.from));
    to = startOfNextLocalDay(new Date(query.to));
  } else if (preset === 'today') {
    from = startOfLocalDay(now);
    to = startOfNextLocalDay(now);
  } else if (preset === 'last7days') {
    to = startOfNextLocalDay(now);
    from = startOfLocalDay(now);
    from.setDate(from.getDate() - 6);
  } else if (preset === 'previousMonth') {
    const firstThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = firstThisMonth;
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new BadRequestException('Intervalo de datas invalido.');
  }
  const days = Math.ceil((to.getTime() - from.getTime()) / 86_400_000);
  if (days > MAX_RANGE_DAYS) {
    throw new BadRequestException(`Intervalo maximo permitido: ${MAX_RANGE_DAYS} dias.`);
  }

  return { from, to, preset, timezone: DEFAULT_TIMEZONE };
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfNextLocalDay(date: Date) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + 1);
  return next;
}

function eachLocalDay(from: Date, exclusiveTo: Date) {
  const labels: string[] = [];
  const cursor = startOfLocalDay(from);
  while (cursor < exclusiveTo) {
    labels.push(toDateLabel(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return labels;
}

function toDayMap(rows: ChartRaw[]) {
  return new Map(rows.map((row) => [toDateLabel(new Date(row.day)), toNumber(row.value)]));
}

function toDateLabel(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toNumber(value: bigint | number | null | undefined) {
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return value;
  return 0;
}
