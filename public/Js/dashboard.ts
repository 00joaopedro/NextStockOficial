type DashboardChart = { destroy(): void; render(): Promise<void> };
declare const ApexCharts: undefined | (new (element: HTMLElement, options: object) => DashboardChart);

type SummaryResponse = {
  grossRevenueCents: number;
  totalExpensesCents: number | null;
  grossProfitCents: number | null;
  netProfitCents: number | null;
  averageTicketCents: number;
  permissions: { canSeeFinancial: boolean };
};

type ChartResponse = {
  labels: string[];
  revenues: number[];
  expenses: number[] | null;
  net: number[] | null;
};

type TopProduct = {
  productId: string | null;
  productName: string;
  quantitySold: number;
  revenueCents: number;
  grossProfitCents: number | null;
};

type ProductMetricsResponse = {
  productName: string;
  quantitySold: number;
  revenueCents: number;
  sharePercentage: number;
};

type AlertsResponse = {
  upcomingExpenses: Array<{ name: string; totalCents: number; dueDate: string }>;
  upcomingAppointments: Array<{ cliente: string; animal: string; servico: string; startAt: string }>;
  petshopEnabled: boolean;
};

type DashboardBundle = {
  summary: SummaryResponse;
  charts: ChartResponse;
  topProducts: { items: TopProduct[] };
  alerts: AlertsResponse;
};

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const presetSelect = element<HTMLSelectElement>("time-range");
const fromInput = element<HTMLInputElement>("custom-from");
const toInput = element<HTMLInputElement>("custom-to");
const customFields = element("custom-period-fields");
const statusModeSelect = element<HTMLSelectElement>("status-mode");
const productSearchInput = element<HTMLInputElement>("product-search");
const productResults = element("product-autocomplete");
const productSearchStatus = element("product-search-status");
const selectedProductLabel = element("selected-product-label");
const clearProductButton = element<HTMLButtonElement>("clear-product");
const applyFiltersButton = element<HTMLButtonElement>("apply-filters");
const productsTableBody = element("products-table-body");
const stateMessage = element("dashboard-state");
const productMetricsPanel = element("product-metrics");
const upcomingExpensesList = element("upcoming-expenses");
const upcomingAppointmentsList = element("upcoming-appointments");
const appointmentsPanel = element("appointments-panel");
const chartElement = element("chart");
const chartFallback = element<HTMLDetailsElement>("chart-fallback");
const cashflowHead = element("cashflow-head");
const cashflowBody = element("cashflow-body");
const branchLabel = element("dashboard-branch");
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const formatCents = (value: number) => currency.format(value / 100);
const productPrompt = "Selecione um produto para ver sua participação no faturamento.";

let chart: DashboardChart | null = null;
let chartData: ChartResponse | null = null;
let appliedQuery: string | null = null;
let selectedProductId = "";
let metricsAbort: AbortController | null = null;
let autocompleteAbort: AbortController | null = null;
let autocompleteTimer: number | undefined;

function readSessionObject<T>(key: string): T | null {
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null") as T | null;
  } catch {
    return null;
  }
}

function headers(): HeadersInit {
  const branch = readSessionObject<{ id?: string; name?: string; isSupportContext?: boolean }>("nextstockSelectedBranch");
  const branchId = branch?.id || sessionStorage.getItem("nextstockBranchId");
  const support = readSessionObject<{ branchId?: string; mode?: string }>("nextstockDevSupportContext");
  if (branch?.name) {
    branchLabel.textContent = branch.name;
    branchLabel.hidden = false;
  }
  return {
    Accept: "application/json",
    ...(branchId ? { "x-nextstock-branch-id": branchId } : {}),
    ...(branchId && (branch?.isSupportContext || (support?.branchId === branchId && support.mode === "support"))
      ? { "x-nextstock-dev-context": "support" }
      : {}),
  };
}

function buildQuery(): string {
  const params = new URLSearchParams({ preset: presetSelect.value, statusMode: statusModeSelect.value });
  if (presetSelect.value === "custom") {
    if (!fromInput.value || !toInput.value || fromInput.value > toInput.value) {
      throw new Error("Informe datas válidas. A data inicial deve ser anterior ou igual à final.");
    }
    params.set("from", fromInput.value);
    params.set("to", toInput.value);
  }
  return params.toString();
}

async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { headers: headers(), signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message.join(" ") : body.message;
    throw new Error(message || "Não foi possível carregar o painel.");
  }
  return response.json() as Promise<T>;
}

function setState(message: string, kind: "info" | "error" = "info"): void {
  stateMessage.textContent = message;
  stateMessage.dataset.kind = kind;
}

function renderCards(summary?: SummaryResponse): void {
  const canSeeFinancial = summary?.permissions.canSeeFinancial;
  const financialValue = (value: number | null) => (
    value !== null ? formatCents(value) : canSeeFinancial ? "Indisponível" : "Restrito"
  );
  element("total-revenue").textContent = summary ? formatCents(summary.grossRevenueCents) : "—";
  element("average-ticket").textContent = summary ? formatCents(summary.averageTicketCents) : "—";
  element("total-expenses").textContent = summary ? financialValue(summary.totalExpensesCents) : "—";
  element("gross-profit").textContent = summary ? financialValue(summary.grossProfitCents) : "—";
  element("net-profit").textContent = summary ? financialValue(summary.netProfitCents) : "—";
}

function renderTopProducts(products: TopProduct[], empty = "Nenhum produto vendido no período selecionado."): void {
  productsTableBody.replaceChildren();
  if (!products.length) {
    const row = document.createElement("tr");
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = empty;
    productsTableBody.append(row);
    return;
  }
  for (const product of products) {
    const row = document.createElement("tr");
    row.insertCell().textContent = product.productName;
    row.insertCell().textContent = String(product.quantitySold);
    row.insertCell().textContent = formatCents(product.revenueCents);
    row.insertCell().textContent = product.grossProfitCents === null ? "Restrito" : formatCents(product.grossProfitCents);
    const action = row.insertCell();
    const productId = product.productId;
    if (productId) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "link-button";
      button.textContent = "Ver";
      button.setAttribute("aria-label", `Ver métricas de ${product.productName}`);
      button.addEventListener("click", () => {
        selectProduct(productId, product.productName);
        productSearchInput.focus();
      });
      action.append(button);
    }
    productsTableBody.append(row);
  }
}

function seriesFor(data: ChartResponse): Array<{ name: string; values: number[] }> {
  const series = [{ name: "Receitas", values: data.revenues }];
  if (data.expenses && data.net) {
    series.push({ name: "Despesas", values: data.expenses }, { name: "Saldo", values: data.net });
  }
  return series;
}

async function renderChart(data: ChartResponse): Promise<void> {
  const previousChart = chart;
  chart = null;
  chartElement.hidden = true;
  let instance: DashboardChart | null = null;
  try {
    previousChart?.destroy();
    chartElement.replaceChildren();
    if (!data.labels.length || typeof ApexCharts !== "function") return;
    chartElement.hidden = false;
    instance = new ApexCharts(chartElement, {
      chart: { type: "line", height: 360, toolbar: { show: false } },
      series: seriesFor(data).map(({ name, values }) => ({ name, data: values.map((value) => value / 100) })),
      xaxis: { categories: data.labels },
      stroke: { curve: "smooth", width: 3 },
      dataLabels: { enabled: false },
      legend: { position: "top" },
      yaxis: { labels: { formatter: (value: number) => currency.format(value) } },
      tooltip: { y: { formatter: (value: number) => currency.format(value) } },
      noData: { text: "Sem dados para exibir" },
    });
    chart = instance;
    await instance.render();
  } catch {
    if (chartData === data && chart === instance) {
      chart = null;
      chartElement.hidden = true;
      chartElement.replaceChildren();
    }
  }
}

function showCashflow(data: ChartResponse): void {
  chartData = data;
  const series = seriesFor(data);
  cashflowHead.replaceChildren();
  for (const name of ["Dia", ...series.map((item) => item.name)]) {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = name;
    cashflowHead.append(header);
  }
  cashflowBody.replaceChildren(...data.labels.map((day, index) => {
    const row = document.createElement("tr");
    row.insertCell().textContent = day.split("-").reverse().join("/");
    for (const entry of series) row.insertCell().textContent = formatCents(entry.values[index]);
    return row;
  }));
  chartFallback.hidden = !data.labels.length;
  void renderChart(data);
}

function renderList(element: HTMLElement, items: string[]): void {
  element.replaceChildren(...items.map((text) => {
    const li = document.createElement("li");
    li.textContent = text;
    return li;
  }));
}

function renderAlerts(alerts: AlertsResponse, canSeeFinancial: boolean): void {
  const expenses = alerts.upcomingExpenses.map((item) =>
    `${item.name} · ${formatCents(item.totalCents)} · ${new Date(item.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}`,
  );
  renderList(upcomingExpensesList, expenses.length ? expenses : [
    canSeeFinancial ? "Nenhuma conta pendente vence nos próximos 3 dias." : "Contas a vencer restritas por permissão.",
  ]);
  appointmentsPanel.hidden = !alerts.petshopEnabled;
  const appointments = alerts.upcomingAppointments.map((item) =>
    `${item.servico} · ${item.animal} (${item.cliente}) · ${new Date(item.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
  );
  renderList(upcomingAppointmentsList, appointments.length ? appointments : ["Nenhum agendamento para hoje."]);
}

async function refreshProductMetrics(): Promise<void> {
  metricsAbort?.abort();
  if (!selectedProductId || appliedQuery === null) {
    productMetricsPanel.textContent = productPrompt;
    return;
  }

  const controller = new AbortController();
  metricsAbort = controller;
  productMetricsPanel.textContent = "Carregando métricas do produto…";
  try {
    const metrics = await apiGet<ProductMetricsResponse>(
      `/api/dashboard/product/${encodeURIComponent(selectedProductId)}?${appliedQuery}`,
      controller.signal,
    );
    if (controller.signal.aborted) return;
    const details = [
      `Produto: ${metrics.productName}`,
      `Quantidade: ${metrics.quantitySold}`,
      `Receita: ${formatCents(metrics.revenueCents)}`,
      `Participação: ${metrics.sharePercentage.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
    ];
    productMetricsPanel.replaceChildren(...details.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      return paragraph;
    }));
  } catch (error) {
    if (!controller.signal.aborted) {
      productMetricsPanel.textContent = error instanceof Error ? error.message : "Não foi possível carregar as métricas do produto.";
    }
  }
}

async function loadDashboard(): Promise<void> {
  let query: string;
  try {
    query = buildQuery();
  } catch (error) {
    setState((error as Error).message, "error");
    return;
  }

  applyFiltersButton.disabled = true;
  setState("Carregando dados do Dashboard…");
  try {
    const bundle = await apiGet<DashboardBundle>(`/api/dashboard?${query}`);
    appliedQuery = query;
    renderCards(bundle.summary);
    renderTopProducts(bundle.topProducts.items);
    renderAlerts(bundle.alerts, bundle.summary.permissions.canSeeFinancial);
    showCashflow(bundle.charts);
    void refreshProductMetrics();
    setState(bundle.summary.permissions.canSeeFinancial ? "Dashboard atualizado." : "Alguns dados financeiros são restritos por permissão.");
  } catch (error) {
    appliedQuery = null;
    renderCards();
    renderTopProducts([], "Não foi possível carregar o ranking de produtos.");
    upcomingExpensesList.replaceChildren();
    upcomingAppointmentsList.replaceChildren();
    appointmentsPanel.hidden = true;
    showCashflow({ labels: [], revenues: [], expenses: null, net: null });
    void refreshProductMetrics();
    setState(error instanceof Error ? error.message : "Erro ao carregar o Dashboard.", "error");
  } finally {
    applyFiltersButton.disabled = false;
  }
}

function clearSearch(): void {
  autocompleteAbort?.abort();
  window.clearTimeout(autocompleteTimer);
  productResults.replaceChildren();
  productResults.hidden = true;
  productSearchStatus.textContent = "";
}

function selectProduct(productId: string, name: string): void {
  clearSearch();
  selectedProductId = productId;
  productSearchInput.value = name;
  selectedProductLabel.textContent = name;
  void refreshProductMetrics();
}

function bindAutocomplete(): void {
  productSearchInput.addEventListener("input", () => {
    clearSearch();
    const search = productSearchInput.value.trim();
    if (selectedProductId) {
      selectedProductId = "";
      selectedProductLabel.textContent = "";
      void refreshProductMetrics();
    }
    if (search.length < 2) return;
    const controller = new AbortController();
    autocompleteAbort = controller;
    autocompleteTimer = window.setTimeout(async () => {
      try {
        const { products } = await apiGet<{ products: Array<{ id: string; name: string }> }>(
          `/api/dashboard/products?search=${encodeURIComponent(search)}`,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        productResults.replaceChildren(...products.map((product) => {
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = product.name;
          button.addEventListener("click", () => selectProduct(product.id, product.name));
          return button;
        }));
        productResults.hidden = !products.length;
        productSearchStatus.textContent = products.length ? "" : "Nenhum produto encontrado na filial.";
      } catch {
        if (!controller.signal.aborted) productSearchStatus.textContent = "Busca de produtos indisponível no momento.";
      }
    }, 250);
  });
}

function initDemo(): void {
  setState("Modo demonstração com dados de exemplo.");
  for (const control of [applyFiltersButton, presetSelect, statusModeSelect, productSearchInput, clearProductButton]) {
    control.disabled = true;
  }
  renderCards({
    grossRevenueCents: 128900, totalExpensesCents: 38400, grossProfitCents: 84200,
    netProfitCents: 45800, averageTicketCents: 12890, permissions: { canSeeFinancial: true },
  });
  renderTopProducts([{ productId: null, productName: "Produto demo", quantitySold: 10, revenueCents: 128900, grossProfitCents: 84200 }]);
  showCashflow({ labels: ["Hoje"], revenues: [128900], expenses: [38400], net: [90500] });
  renderAlerts({ upcomingExpenses: [], upcomingAppointments: [], petshopEnabled: false }, true);
}

function init(): void {
  element("dashboard-chart-library").addEventListener("load", () => {
    if (chartData && !chart) void renderChart(chartData);
  });
  window.addEventListener("nextstock:system-context", (event) => {
    const name = (event as CustomEvent<{ selectedBranch?: { name?: string } }>).detail?.selectedBranch?.name;
    if (name) {
      branchLabel.textContent = name;
      branchLabel.hidden = false;
    }
  });
  if ((window as Window & { isNextStockDemoMode?: () => boolean }).isNextStockDemoMode?.()) {
    initDemo();
    return;
  }
  presetSelect.addEventListener("change", () => {
    customFields.hidden = presetSelect.value !== "custom";
  });
  applyFiltersButton.addEventListener("click", () => void loadDashboard());
  clearProductButton.addEventListener("click", () => selectProduct("", ""));
  bindAutocomplete();
  void loadDashboard();
}

init();
export {};
