"use strict";
const presetSelect = document.getElementById("time-range");
const fromInput = document.getElementById("custom-from");
const toInput = document.getElementById("custom-to");
const customFields = document.getElementById("custom-period-fields");
const statusModeSelect = document.getElementById("status-mode");
const productSearchInput = document.getElementById("product-search");
const productResults = document.getElementById("product-autocomplete");
const selectedProductLabel = document.getElementById("selected-product-label");
const clearProductButton = document.getElementById("clear-product");
const applyFiltersButton = document.getElementById("apply-filters");
const grossProfitElement = document.getElementById("gross-profit");
const netProfitElement = document.getElementById("net-profit");
const totalRevenueElement = document.getElementById("total-revenue");
const totalExpensesElement = document.getElementById("total-expenses");
const averageTicketElement = document.getElementById("average-ticket");
const productsTableBody = document.getElementById("products-table-body");
const chartSubtitle = document.getElementById("chart-subtitle");
const stateMessage = document.getElementById("dashboard-state");
const productMetricsPanel = document.getElementById("product-metrics");
const upcomingExpensesList = document.getElementById("upcoming-expenses");
const upcomingAppointmentsList = document.getElementById("upcoming-appointments");
const appointmentsPanel = document.getElementById("appointments-panel");
const tenantSelect = document.getElementById("tenant-select");
const tenantBadgeName = document.getElementById("tenant-badge-name");
let chart = null;
let selectedProductId = "";
let autocompleteAbort = null;
function formatCurrencyFromCents(value) {
    if (value === null)
        return "Restrito";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}
function headers() {
    const output = {};
    const token = sessionStorage.getItem("nextstockAccessToken") || localStorage.getItem("nextstockAccessToken");
    if (token)
        output.Authorization = `Bearer ${token}`;
    try {
        const branch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
        if (branch?.id)
            output["x-nextstock-branch-id"] = branch.id;
        if (branch?.isSupportContext)
            output["x-nextstock-dev-context"] = "support";
        tenantBadgeName && (tenantBadgeName.textContent = branch?.name || "");
    }
    catch {
        return output;
    }
    return output;
}
function buildQuery(productId = selectedProductId) {
    const params = new URLSearchParams();
    params.set("preset", (presetSelect.value || "currentMonth"));
    params.set("statusMode", (statusModeSelect?.value || "confirmed"));
    if (presetSelect.value === "custom") {
        if (fromInput?.value)
            params.set("from", fromInput.value);
        if (toInput?.value)
            params.set("to", toInput.value);
    }
    if (productId)
        params.set("productId", productId);
    return params.toString();
}
async function apiGet(path, signal) {
    const response = await fetch(path, { headers: headers(), signal });
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "Nao foi possivel carregar o dashboard.");
    }
    return response.json();
}
function setState(message, kind = "info") {
    if (!stateMessage)
        return;
    stateMessage.textContent = message;
    stateMessage.dataset.kind = kind;
}
function clearChildren(element) {
    while (element.firstChild)
        element.removeChild(element.firstChild);
}
function appendEmptyRow(message) {
    clearChildren(productsTableBody);
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 5;
    td.textContent = message;
    tr.appendChild(td);
    productsTableBody.appendChild(tr);
}
async function fetchDashboardSummary() {
    return apiGet(`/api/dashboard/summary?${buildQuery()}`);
}
async function fetchDashboardCharts() {
    return apiGet(`/api/dashboard/charts?${buildQuery()}`);
}
async function fetchTopProducts() {
    return apiGet(`/api/dashboard/top-products?${buildQuery()}`);
}
async function fetchDashboardAlerts() {
    return apiGet("/api/dashboard/alerts");
}
async function fetchProductMetrics(productId) {
    return apiGet(`/api/dashboard/product/${encodeURIComponent(productId)}?${buildQuery(productId)}`);
}
async function fetchProductAutocomplete(search, signal) {
    const response = await apiGet(`/api/products/lookup?search=${encodeURIComponent(search)}&limit=10`, signal);
    return response.products;
}
function renderCards(summary) {
    totalRevenueElement.textContent = formatCurrencyFromCents(summary.grossRevenueCents);
    totalExpensesElement.textContent = formatCurrencyFromCents(summary.totalExpensesCents);
    grossProfitElement.textContent = formatCurrencyFromCents(summary.grossProfitCents);
    netProfitElement.textContent = formatCurrencyFromCents(summary.netProfitCents);
    averageTicketElement.textContent = formatCurrencyFromCents(summary.averageTicketCents);
}
function renderTopProducts(products) {
    if (products.items.length === 0) {
        appendEmptyRow("Nenhum produto vendido no periodo selecionado.");
        return;
    }
    clearChildren(productsTableBody);
    for (const product of products.items) {
        const tr = document.createElement("tr");
        [
            product.productName,
            String(product.quantitySold),
            formatCurrencyFromCents(product.revenueCents),
            formatCurrencyFromCents(product.grossProfitCents),
            product.productId ? "Selecionar" : "",
        ].forEach((value, index) => {
            const td = document.createElement("td");
            if (index === 4 && product.productId) {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "link-button";
                button.textContent = "Ver";
                button.addEventListener("click", () => selectProduct(product.productId, product.productName));
                td.appendChild(button);
            }
            else {
                td.textContent = value;
            }
            tr.appendChild(td);
        });
        productsTableBody.appendChild(tr);
    }
}
function renderChart(data) {
    chartSubtitle.textContent = "Fluxo de caixa por dia: receitas, despesas e saldo.";
    const series = [
        { name: "Receitas", data: data.revenues.map((value) => value / 100) },
    ];
    if (data.expenses && data.net) {
        series.push({ name: "Despesas", data: data.expenses.map((value) => value / 100) });
        series.push({ name: "Saldo", data: data.net.map((value) => value / 100) });
    }
    const options = {
        chart: { type: "line", height: 360, toolbar: { show: false } },
        series,
        xaxis: { categories: data.labels },
        stroke: { curve: "smooth", width: 3 },
        dataLabels: { enabled: false },
        legend: { position: "top" },
        yaxis: { labels: { formatter: (value) => formatCurrencyFromCents(Math.round(value * 100)) } },
        tooltip: { y: { formatter: (value) => formatCurrencyFromCents(Math.round(value * 100)) } },
        noData: { text: "Sem dados para exibir" },
    };
    const chartElement = document.querySelector("#chart");
    if (!chartElement)
        return;
    if (chart)
        chart.destroy();
    chart = new ApexCharts(chartElement, options);
    chart.render();
}
function renderAlerts(alerts) {
    if (upcomingExpensesList) {
        renderList(upcomingExpensesList, alerts.upcomingExpenses, "Nenhuma conta pendente vence nos proximos 3 dias.", (item) => `${item.name} - ${formatCurrencyFromCents(item.totalCents)} - ${new Date(item.dueDate).toLocaleDateString("pt-BR")}`);
    }
    if (appointmentsPanel)
        appointmentsPanel.hidden = !alerts.petshopEnabled;
    if (upcomingAppointmentsList && alerts.petshopEnabled) {
        renderList(upcomingAppointmentsList, alerts.upcomingAppointments, "Nenhum agendamento para hoje.", (item) => `${item.servico} - ${item.animal} (${item.cliente}) - ${new Date(item.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
    }
}
function renderList(element, items, empty, formatter) {
    clearChildren(element);
    if (items.length === 0) {
        const li = document.createElement("li");
        li.textContent = empty;
        element.appendChild(li);
        return;
    }
    for (const item of items) {
        const li = document.createElement("li");
        li.textContent = formatter(item);
        element.appendChild(li);
    }
}
async function renderProductMetrics() {
    if (!productMetricsPanel)
        return;
    clearChildren(productMetricsPanel);
    if (!selectedProductId) {
        productMetricsPanel.textContent = "Selecione um produto para ver participacao no faturamento.";
        return;
    }
    const metrics = await fetchProductMetrics(selectedProductId);
    const lines = [
        `Produto: ${metrics.productName}`,
        `Quantidade: ${metrics.quantitySold}`,
        `Receita: ${formatCurrencyFromCents(metrics.revenueCents)}`,
        `Participacao: ${metrics.sharePercentage.toFixed(2)}%`,
    ];
    for (const line of lines) {
        const p = document.createElement("p");
        p.textContent = line;
        productMetricsPanel.appendChild(p);
    }
}
async function loadDashboard() {
    applyFiltersButton.disabled = true;
    setState("Carregando dados reais do dashboard...");
    try {
        const [summary, charts, topProducts, alerts] = await Promise.all([
            fetchDashboardSummary(),
            fetchDashboardCharts(),
            fetchTopProducts(),
            fetchDashboardAlerts(),
        ]);
        const bundle = { summary, charts, topProducts, alerts };
        renderCards(bundle.summary);
        renderChart(bundle.charts);
        renderTopProducts(bundle.topProducts);
        renderAlerts(bundle.alerts);
        await renderProductMetrics();
        setState(bundle.summary.permissions.canSeeFinancial ? "Dashboard atualizado." : "Dashboard atualizado com dados financeiros restritos por permissao.");
    }
    catch (error) {
        renderCards({ grossRevenueCents: 0, totalExpensesCents: null, grossProfitCents: null, netProfitCents: null, averageTicketCents: 0, salesCount: 0, permissions: { canSeeFinancial: false, canSeeProducts: false } });
        appendEmptyRow("Nao foi possivel carregar os produtos.");
        setState(error instanceof Error ? error.message : "Erro ao carregar dashboard.", "error");
    }
    finally {
        applyFiltersButton.disabled = false;
    }
}
function selectProduct(productId, name) {
    selectedProductId = productId;
    productSearchInput.value = name;
    if (selectedProductLabel)
        selectedProductLabel.textContent = name;
    if (productResults)
        clearChildren(productResults);
    void renderProductMetrics();
}
function bindAutocomplete() {
    productSearchInput.addEventListener("input", () => {
        const search = productSearchInput.value.trim();
        selectedProductId = "";
        if (selectedProductLabel)
            selectedProductLabel.textContent = "";
        autocompleteAbort?.abort();
        if (!productResults)
            return;
        clearChildren(productResults);
        if (search.length < 2)
            return;
        const controller = new AbortController();
        autocompleteAbort = controller;
        window.setTimeout(async () => {
            if (controller.signal.aborted)
                return;
            try {
                const products = await fetchProductAutocomplete(search, controller.signal);
                clearChildren(productResults);
                for (const product of products) {
                    const button = document.createElement("button");
                    button.type = "button";
                    button.textContent = product.name;
                    button.addEventListener("click", () => selectProduct(product.id, product.name));
                    productResults.appendChild(button);
                }
            }
            catch (error) {
                if (!controller.signal.aborted)
                    setState("Busca de produtos indisponivel no momento.", "error");
            }
        }, 250);
    });
}
function bindEvents() {
    tenantSelect?.closest(".field")?.setAttribute("hidden", "true");
    presetSelect.addEventListener("change", () => {
        if (customFields)
            customFields.hidden = presetSelect.value !== "custom";
    });
    applyFiltersButton.addEventListener("click", () => void loadDashboard());
    clearProductButton?.addEventListener("click", () => {
        selectedProductId = "";
        productSearchInput.value = "";
        selectedProductLabel && (selectedProductLabel.textContent = "");
        void renderProductMetrics();
    });
    bindAutocomplete();
}
function initDemo() {
    setState("Modo demonstracao ativo. Os dados abaixo nao sao fonte de producao.");
    renderCards({
        grossRevenueCents: 128900,
        totalExpensesCents: 38400,
        grossProfitCents: 84200,
        netProfitCents: 45800,
        averageTicketCents: 12890,
        salesCount: 10,
        permissions: { canSeeFinancial: true, canSeeProducts: true },
    });
    renderTopProducts({
        items: [
            { productId: null, productName: "Produto demo", quantitySold: 10, revenueCents: 128900, grossProfitCents: 84200 },
        ],
    });
    renderChart({ labels: ["Hoje"], revenues: [128900], expenses: [38400], net: [90500] });
    renderAlerts({ upcomingExpenses: [], upcomingAppointments: [], petshopEnabled: false });
}
function init() {
    bindEvents();
    if (window.isNextStockDemoMode?.()) {
        initDemo();
        return;
    }
    void loadDashboard();
}
init();
