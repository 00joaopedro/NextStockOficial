declare const ApexCharts: any;

type RangeType = "day" | "week" | "month" | "year";

interface Sale {
  date: string;
  productName: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
}

interface Expense {
  date: string;
  description: string;
  amount: number;
}

interface Tenant {
  id: string;
  name: string;
  sales: Sale[];
  expenses: Expense[];
}

interface Totals {
  totalRevenue: number;
  totalCost: number;
  totalExpenses: number;
  grossProfit: number;
  netProfit: number;
}

interface ProductSummary {
  productName: string;
  quantity: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  netProfit: number;
}

interface ChartPoint {
  label: string;
  grossProfit: number;
  netProfit: number;
}

const tenants: Tenant[] = [
  {
    id: "tenant-matriz",
    name: "Loja Matriz",
    sales: [
      { date: "2026-03-17", productName: "Arroz 5kg", quantity: 12, unitCost: 18, unitPrice: 28 },
      { date: "2026-03-17", productName: "Feijão 1kg", quantity: 18, unitCost: 6, unitPrice: 10 },
      { date: "2026-03-16", productName: "Café 500g", quantity: 10, unitCost: 9, unitPrice: 16 },
      { date: "2026-03-15", productName: "Leite Integral", quantity: 24, unitCost: 3.2, unitPrice: 5.8 },
      { date: "2026-03-10", productName: "Arroz 5kg", quantity: 15, unitCost: 18, unitPrice: 28 },
      { date: "2026-03-05", productName: "Macarrão", quantity: 20, unitCost: 3, unitPrice: 6.5 },
      { date: "2026-02-18", productName: "Café 500g", quantity: 14, unitCost: 9, unitPrice: 16 },
      { date: "2026-01-20", productName: "Leite Integral", quantity: 40, unitCost: 3.2, unitPrice: 5.8 }
    ],
    expenses: [
      { date: "2026-03-17", description: "Energia", amount: 85 },
      { date: "2026-03-16", description: "Frete", amount: 40 },
      { date: "2026-03-10", description: "Taxas", amount: 65 },
      { date: "2026-03-01", description: "Sistema", amount: 120 },
      { date: "2026-02-15", description: "Internet", amount: 99 },
      { date: "2026-01-10", description: "Manutenção", amount: 150 }
    ]
  },
  {
    id: "tenant-filial-centro",
    name: "Filial Centro",
    sales: [
      { date: "2026-03-17", productName: "Refrigerante 2L", quantity: 22, unitCost: 5.5, unitPrice: 9.5 },
      { date: "2026-03-16", productName: "Biscoito", quantity: 30, unitCost: 2, unitPrice: 4.5 },
      { date: "2026-03-14", productName: "Café 500g", quantity: 8, unitCost: 9, unitPrice: 16 },
      { date: "2026-03-07", productName: "Arroz 5kg", quantity: 9, unitCost: 18, unitPrice: 29 },
      { date: "2026-02-20", productName: "Biscoito", quantity: 25, unitCost: 2, unitPrice: 4.5 },
      { date: "2026-01-08", productName: "Refrigerante 2L", quantity: 40, unitCost: 5.5, unitPrice: 9.5 }
    ],
    expenses: [
      { date: "2026-03-17", description: "Energia", amount: 60 },
      { date: "2026-03-11", description: "Frete", amount: 30 },
      { date: "2026-02-05", description: "Sistema", amount: 120 },
      { date: "2026-01-15", description: "Marketing", amount: 75 }
    ]
  }
];

const tenantSelect = document.getElementById("tenant-select") as HTMLSelectElement;
const tenantBadgeName = document.getElementById("tenant-badge-name") as HTMLElement;
const timeRangeSelect = document.getElementById("time-range") as HTMLSelectElement;
const productSearchInput = document.getElementById("product-search") as HTMLInputElement;
const applyFiltersButton = document.getElementById("apply-filters") as HTMLButtonElement;
const grossProfitElement = document.getElementById("gross-profit") as HTMLElement;
const netProfitElement = document.getElementById("net-profit") as HTMLElement;
const totalRevenueElement = document.getElementById("total-revenue") as HTMLElement;
const totalCostElement = document.getElementById("total-cost") as HTMLElement;
const totalExpensesElement = document.getElementById("total-expenses") as HTMLElement;
const productsTableBody = document.getElementById("products-table-body") as HTMLElement;
const chartSubtitle = document.getElementById("chart-subtitle") as HTMLElement;

let chart: any = null;

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function getCurrentTenant(): Tenant {
  const selectedTenantId = tenantSelect.value;
  return tenants.find((tenant) => tenant.id === selectedTenantId) ?? tenants[0];
}

function getRangeStart(range: RangeType): Date {
  const now = new Date("2026-03-17T12:00:00");

  switch (range) {
    case "day":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());

    case "week": {
      const start = new Date(now);
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
      return start;
    }

    case "month":
      return new Date(now.getFullYear(), now.getMonth(), 1);

    case "year":
      return new Date(now.getFullYear(), 0, 1);

    default:
      return new Date(now.getFullYear(), now.getMonth(), 1);
  }
}

function isWithinRange(date: string, range: RangeType): boolean {
  const current = parseDate(date);
  const start = getRangeStart(range);
  const now = new Date("2026-03-17T23:59:59");

  return current >= start && current <= now;
}

function filterSales(tenant: Tenant, range: RangeType, searchTerm: string): Sale[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return tenant.sales.filter((sale) => {
    const inRange = isWithinRange(sale.date, range);
    const matchesProduct =
      !normalizedSearch ||
      sale.productName.toLowerCase().includes(normalizedSearch);

    return inRange && matchesProduct;
  });
}

function filterExpenses(tenant: Tenant, range: RangeType): Expense[] {
  return tenant.expenses.filter((expense) => isWithinRange(expense.date, range));
}

function calculateTotals(sales: Sale[], expenses: Expense[]): Totals {
  const totalRevenue = sales.reduce((sum, sale) => sum + sale.quantity * sale.unitPrice, 0);
  const totalCost = sales.reduce((sum, sale) => sum + sale.quantity * sale.unitCost, 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const grossProfit = totalRevenue - totalCost;
  const netProfit = grossProfit - totalExpenses;

  return {
    totalRevenue,
    totalCost,
    totalExpenses,
    grossProfit,
    netProfit
  };
}

function buildProductSummary(sales: Sale[], totalExpenses: number): ProductSummary[] {
  const grouped = new Map<string, ProductSummary>();

  for (const sale of sales) {
    const revenue = sale.quantity * sale.unitPrice;
    const cost = sale.quantity * sale.unitCost;
    const grossProfit = revenue - cost;

    const current = grouped.get(sale.productName);

    if (!current) {
      grouped.set(sale.productName, {
        productName: sale.productName,
        quantity: sale.quantity,
        revenue,
        cost,
        grossProfit,
        netProfit: 0
      });
    } else {
      current.quantity += sale.quantity;
      current.revenue += revenue;
      current.cost += cost;
      current.grossProfit += grossProfit;
    }
  }

  const summaries = Array.from(grouped.values());
  const totalGross = summaries.reduce((sum, item) => sum + item.grossProfit, 0);

  return summaries
    .map((item) => {
      const proportionalExpense =
        totalGross > 0 ? (item.grossProfit / totalGross) * totalExpenses : 0;

      return {
        ...item,
        netProfit: item.grossProfit - proportionalExpense
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

function getBucketLabel(date: string, range: RangeType): string {
  const parsed = parseDate(date);

  switch (range) {
    case "day":
    case "week":
    case "month":
      return parsed.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit"
      });

    case "year":
      return parsed.toLocaleDateString("pt-BR", {
        month: "short"
      });

    default:
      return date;
  }
}

function buildChartData(sales: Sale[], expenses: Expense[], range: RangeType): ChartPoint[] {
  const buckets = new Map<string, ChartPoint>();

  for (const sale of sales) {
    const label = getBucketLabel(sale.date, range);
    const gross = sale.quantity * (sale.unitPrice - sale.unitCost);

    if (!buckets.has(label)) {
      buckets.set(label, { label, grossProfit: 0, netProfit: 0 });
    }

    const point = buckets.get(label);

    if (point) {
      point.grossProfit += gross;
      point.netProfit += gross;
    }
  }

  for (const expense of expenses) {
    const label = getBucketLabel(expense.date, range);

    if (!buckets.has(label)) {
      buckets.set(label, { label, grossProfit: 0, netProfit: 0 });
    }

    const point = buckets.get(label);

    if (point) {
      point.netProfit -= expense.amount;
    }
  }

  return Array.from(buckets.values());
}

function renderCards(totals: Totals): void {
  grossProfitElement.textContent = formatCurrency(totals.grossProfit);
  netProfitElement.textContent = formatCurrency(totals.netProfit);
  totalRevenueElement.textContent = formatCurrency(totals.totalRevenue);
  totalCostElement.textContent = formatCurrency(totals.totalCost);
  totalExpensesElement.textContent = formatCurrency(totals.totalExpenses);
}

function renderTable(products: ProductSummary[]): void {
  if (products.length === 0) {
    productsTableBody.innerHTML = `
      <tr>
        <td colspan="6">Nenhum produto encontrado para os filtros selecionados.</td>
      </tr>
    `;
    return;
  }

  productsTableBody.innerHTML = products
    .map((product) => {
      return `
        <tr>
          <td>${product.productName}</td>
          <td>${product.quantity}</td>
          <td>${formatCurrency(product.revenue)}</td>
          <td>${formatCurrency(product.cost)}</td>
          <td class="positive">${formatCurrency(product.grossProfit)}</td>
          <td class="positive">${formatCurrency(product.netProfit)}</td>
        </tr>
      `;
    })
    .join("");
}

function renderChart(chartData: ChartPoint[], range: RangeType): void {
  const labels = chartData.map((item) => item.label);
  const grossSeries = chartData.map((item) => Number(item.grossProfit.toFixed(2)));
  const netSeries = chartData.map((item) => Number(item.netProfit.toFixed(2)));

  chartSubtitle.textContent =
    `Período selecionado: ${translateRange(range)} • comparação entre lucro bruto e líquido`;

  const options = {
    chart: {
      type: "line",
      height: 360,
      toolbar: {
        show: false
      }
    },
    series: [
      {
        name: "Lucro Bruto",
        data: grossSeries
      },
      {
        name: "Lucro Líquido",
        data: netSeries
      }
    ],
    xaxis: {
      categories: labels
    },
    stroke: {
      curve: "smooth",
      width: 3
    },
    dataLabels: {
      enabled: false
    },
    legend: {
      position: "top"
    },
    yaxis: {
      labels: {
        formatter: (value: number) => formatCurrency(value)
      }
    },
    tooltip: {
      y: {
        formatter: (value: number) => formatCurrency(value)
      }
    },
    noData: {
      text: "Sem dados para exibir"
    }
  };

  if (chart) {
    chart.destroy();
  }

  const chartElement = document.querySelector("#chart");

  if (!chartElement) {
    return;
  }

  chart = new ApexCharts(chartElement, options);
  chart.render();
}

function translateRange(range: RangeType): string {
  const labels: Record<RangeType, string> = {
    day: "Dia",
    week: "Semana",
    month: "Mês",
    year: "Ano"
  };

  return labels[range];
}

function populateTenantSelect(): void {
  tenantSelect.innerHTML = tenants
    .map((tenant) => `<option value="${tenant.id}">${tenant.name}</option>`)
    .join("");
}

function renderProductionEmptyState(): void {
  tenantSelect.innerHTML = '<option value="">Dados reais indisponiveis</option>';
  tenantBadgeName.textContent = "Sem dados reais";
  renderCards({
    totalRevenue: 0,
    totalCost: 0,
    totalExpenses: 0,
    grossProfit: 0,
    netProfit: 0
  });
  renderTable([]);
  renderChart([], timeRangeSelect.value as RangeType);
  chartSubtitle.textContent =
    "Dashboard real ainda nao esta conectado a uma API de producao para este tenant/filial.";
}

function updateDashboard(): void {
  const tenant = getCurrentTenant();
  const range = timeRangeSelect.value as RangeType;
  const searchTerm = productSearchInput.value;

  tenantBadgeName.textContent = tenant.name;

  const filteredSales = filterSales(tenant, range, searchTerm);
  const filteredExpenses = filterExpenses(tenant, range);
  const totals = calculateTotals(filteredSales, filteredExpenses);
  const productSummary = buildProductSummary(filteredSales, totals.totalExpenses);
  const chartData = buildChartData(filteredSales, filteredExpenses, range);

  renderCards(totals);
  renderTable(productSummary);
  renderChart(chartData, range);
}

function bindEvents(): void {
  applyFiltersButton.addEventListener("click", updateDashboard);
  tenantSelect.addEventListener("change", updateDashboard);
  timeRangeSelect.addEventListener("change", updateDashboard);

  productSearchInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      updateDashboard();
    }
  });
}

function init(): void {
  if (!(window as any).isNextStockDemoMode?.()) {
    renderProductionEmptyState();
    return;
  }

  populateTenantSelect();
  bindEvents();
  updateDashboard();
}

init();
