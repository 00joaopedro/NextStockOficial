(function () {
  const state = {
    selectedBranch: null,
    page: 1,
    pageSize: 10,
    totalPages: 0,
    sales: [],
    selectedSale: null,
    searchTimer: null,
  };

  const els = {
    salesGrid: document.getElementById("salesGrid"),
    emptyMessage: document.getElementById("emptyMessage"),
    pagination: document.getElementById("pagination"),
    searchSeller: document.getElementById("searchSeller"),
    filterDate: document.getElementById("filterDate"),
    filterMinValue: document.getElementById("filterMinValue"),
    filterDocumentType: document.getElementById("filterDocumentType"),
    filterStatus: document.getElementById("filterStatus"),
    overlay: document.getElementById("overlay"),
    closeModal: document.getElementById("closeModal"),
    closeModal2: document.getElementById("closeModal2"),
    detailTitle: document.getElementById("detailTitle"),
    detailSummary: document.getElementById("detailSummary"),
    productsList: document.getElementById("productsList"),
    documentsList: document.getElementById("documentsList"),
    printBtn: document.getElementById("printBtn"),
  };

  const DOCUMENT_LABELS = {
    receipt: "Recibo interno — sem validade fiscal",
    nfce65: "NFC-e 65",
    nfe55: "NF-e 55",
  };

  const DOCUMENT_STATUS_LABELS = {
    draft: "Rascunho",
    processing: "Processamento",
    authorized: "Autorizada",
    internal_issued: "Recibo interno emitido",
    rejected: "Rejeitada",
    canceled: "Cancelada",
  };

  const STATUS_LABELS = {
    pending: "Pendente",
    paid: "Paga",
    canceled: "Cancelada",
    refunded: "Estornada",
  };

  const PAYMENT_LABELS = {
    pix: "PIX",
    credit_card: "Cartao de credito",
    debit_card: "Cartao de debito",
    cash: "Dinheiro",
    other: "Outro",
  };

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text == null ? "" : String(text);
    parent.appendChild(element);
    return element;
  }

  function formatMoneyCents(value) {
    return (Number(value || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("pt-BR");
  }

  function getSupportContextHeader() {
    try {
      const support = JSON.parse(
        sessionStorage.getItem("nextstockDevSupportContext") || "null",
      );
      return support?.active === true ? "support" : "";
    } catch {
      return "";
    }
  }

  function buildHeaders(extra) {
    const headers = { Accept: "application/json", ...(extra || {}) };
    if (state.selectedBranch?.id) {
      headers["x-nextstock-branch-id"] = state.selectedBranch.id;
    }
    const devContext = getSupportContextHeader();
    if (devContext) {
      headers["x-nextstock-dev-context"] = devContext;
    }
    return headers;
  }

  async function apiFetch(path, options) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: buildHeaders(options?.headers),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "index.html";
      throw new Error("Sessao expirada.");
    }
    if (!response.ok) {
      throw new Error(
        body.message || "Nao foi possivel consultar o historico.",
      );
    }
    return body;
  }

  async function bootstrapContext() {
    const profileResponse = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (profileResponse.status === 401) {
      window.clearNextStockSessionState?.();
      window.location.href = "index.html";
      return false;
    }
    if (profileResponse.status === 403) {
      throw new Error("Usuario sem permissao para acessar o historico.");
    }
    if (!profileResponse.ok) {
      throw new Error("Nao foi possivel validar a sessao.");
    }

    const contextResponse = await fetch("/api/system/context", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!contextResponse.ok) {
      throw new Error("Nao foi possivel validar o contexto do sistema.");
    }

    const context = await contextResponse.json();
    window.setNextStockBackendContext?.(context);
    state.selectedBranch = context.selectedBranch || context.branch || null;
    if (!state.selectedBranch?.id) {
      throw new Error(
        "Selecione uma filial valida para consultar o historico.",
      );
    }

    sessionStorage.setItem(
      "nextstockSelectedBranch",
      JSON.stringify(state.selectedBranch),
    );
    sessionStorage.setItem("nextstockBranchId", state.selectedBranch.id);
    sessionStorage.setItem(
      "nextstockTenantId",
      state.selectedBranch.tenantId || "",
    );
    return true;
  }

  function buildQuery() {
    const params = new URLSearchParams({
      page: String(state.page),
      pageSize: String(state.pageSize),
    });
    const seller = els.searchSeller.value.trim();
    if (seller) params.set("seller", seller);
    if (els.filterDate.value) {
      params.set("dateFrom", els.filterDate.value);
      params.set("dateTo", els.filterDate.value);
    }
    const minValue = Number(els.filterMinValue.value);
    if (Number.isFinite(minValue) && minValue > 0) {
      params.set("minValue", String(minValue));
    }
    if (els.filterDocumentType.value) {
      params.set("documentType", els.filterDocumentType.value);
    }
    if (els.filterStatus.value) {
      params.set("status", els.filterStatus.value);
    }
    return params.toString();
  }

  async function loadSales() {
    els.salesGrid.textContent = "";
    els.pagination.textContent = "";
    els.emptyMessage.style.display = "block";
    els.emptyMessage.textContent = "Carregando vendas...";

    try {
      const result = await apiFetch(`/api/sales?${buildQuery()}`);
      state.sales = Array.isArray(result.items) ? result.items : [];
      state.totalPages = Number(result.totalPages || 0);
      renderSales();
      renderPagination();
    } catch (error) {
      state.sales = [];
      els.emptyMessage.style.display = "block";
      els.emptyMessage.textContent = error.message;
    }
  }

  function getPrimaryDocument(sale) {
    const fiscal = (sale.documents || []).find(
      (documentInfo) =>
        documentInfo.type === "nfe55" || documentInfo.type === "nfce65",
    );
    return (
      fiscal ||
      (sale.documents || [])[0] || {
        type: sale.documentType || "receipt",
        status: "draft",
      }
    );
  }

  function createInfoBox(label, value) {
    const box = document.createElement("div");
    box.className = "info-box";
    appendText(box, "span", label);
    appendText(box, "strong", value);
    return box;
  }

  function createSaleCard(sale) {
    const card = document.createElement("article");
    card.className = "sale-card";
    card.tabIndex = 0;
    const documentInfo = getPrimaryDocument(sale);

    const top = document.createElement("div");
    top.className = "sale-top";
    appendText(
      top,
      "div",
      DOCUMENT_LABELS[documentInfo.type] || documentInfo.type,
      `sale-type ${documentInfo.type === "receipt" ? "receipt" : "invoice"}`,
    );
    appendText(top, "div", sale.id, "sale-id");

    const title = appendText(
      card,
      "div",
      `${DOCUMENT_LABELS[documentInfo.type] || "Venda"} - ${STATUS_LABELS[sale.status] || sale.status}`,
      "sale-title",
    );

    const info = document.createElement("div");
    info.className = "sale-info";
    info.append(
      createInfoBox("Vendedor", sale.sellerNameSnapshot || "-"),
      createInfoBox(
        "Pagamento",
        PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod,
      ),
      createInfoBox(
        "Maquina",
        sale.paymentMachineNameSnapshot || "Nao utilizada",
      ),
      createInfoBox("Data da venda", formatDate(sale.soldAt)),
      createInfoBox("Status", STATUS_LABELS[sale.status] || sale.status),
      createInfoBox("Total", formatMoneyCents(sale.totalCents)),
    );

    card.insertBefore(top, title);
    card.append(info);
    card.addEventListener("click", () => openDetails(sale.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetails(sale.id);
      }
    });
    return card;
  }

  function renderSales() {
    els.salesGrid.textContent = "";
    if (!state.sales.length) {
      els.emptyMessage.style.display = "block";
      els.emptyMessage.textContent =
        "Nenhuma venda encontrada com os filtros informados.";
      return;
    }
    els.emptyMessage.style.display = "none";
    state.sales.forEach((sale) =>
      els.salesGrid.appendChild(createSaleCard(sale)),
    );
  }

  function createPageButton(label, page, disabled, active) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-btn${active ? " active" : ""}`;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener("click", () => {
      state.page = page;
      loadSales();
    });
    return button;
  }

  function renderPagination() {
    els.pagination.textContent = "";
    if (state.totalPages <= 1) return;
    els.pagination.appendChild(
      createPageButton("Anterior", state.page - 1, state.page <= 1, false),
    );
    for (let page = 1; page <= state.totalPages; page += 1) {
      els.pagination.appendChild(
        createPageButton(String(page), page, false, page === state.page),
      );
    }
    els.pagination.appendChild(
      createPageButton(
        "Proxima",
        state.page + 1,
        state.page >= state.totalPages,
        false,
      ),
    );
  }

  function createSummary(label, value) {
    const card = document.createElement("div");
    card.className = "summary-card";
    appendText(card, "span", label);
    appendText(card, "strong", value);
    return card;
  }

  function renderDetails(sale) {
    state.selectedSale = sale;
    els.detailTitle.textContent = `Venda ${sale.id}`;
    els.detailSummary.textContent = "";
    els.detailSummary.append(
      createSummary("Vendedor", sale.sellerNameSnapshot || "-"),
      createSummary(
        "Pagamento",
        PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod,
      ),
      createSummary(
        "Maquina",
        sale.paymentMachineNameSnapshot || "Nao utilizada",
      ),
      createSummary("Data", formatDate(sale.soldAt)),
      createSummary("Status", STATUS_LABELS[sale.status] || sale.status),
      createSummary("Total", formatMoneyCents(sale.totalCents)),
    );

    els.productsList.textContent = "";
    (sale.items || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "product-row";
      appendText(row, "div", item.productNameSnapshot || item.name || "-");
      appendText(row, "div", item.quantity);
      appendText(row, "div", formatMoneyCents(item.unitPriceCents));
      appendText(row, "div", formatMoneyCents(item.totalPriceCents));
      els.productsList.appendChild(row);
    });

    els.documentsList.textContent = "";
    if (!(sale.documents || []).length) {
      appendText(
        els.documentsList,
        "div",
        "Nenhum documento vinculado.",
        "product-row",
      );
    } else {
      sale.documents.forEach((documentInfo) => {
        const row = document.createElement("div");
        row.className = "product-row";
        appendText(
          row,
          "div",
          DOCUMENT_LABELS[documentInfo.type] || documentInfo.type,
        );
        appendText(
          row,
          "div",
          documentInfo.type === "receipt"
            ? "Recibo interno emitido — sem validade fiscal"
            : DOCUMENT_STATUS_LABELS[documentInfo.status] ||
                documentInfo.status,
        );
        appendText(row, "div", documentInfo.number || "Sem numero");
        if (documentInfo.hasPdf || documentInfo.hasXml) {
          const button = appendText(row, "button", "Baixar", "secondary-btn");
          button.type = "button";
          button.addEventListener("click", (event) => {
            event.stopPropagation();
            downloadDocument(sale.id, documentInfo);
          });
        } else {
          appendText(row, "div", "Arquivo pendente");
        }
        els.documentsList.appendChild(row);
      });
    }

    els.printBtn.classList.add("show");
    els.printBtn.textContent = "Reimprimir recibo interno";
    els.printBtn.onclick = () => printReceipt(sale.id);
    els.overlay.classList.add("active");
  }

  async function openDetails(id) {
    els.overlay.classList.add("active");
    els.detailTitle.textContent = "Carregando detalhes...";
    els.detailSummary.textContent = "";
    els.productsList.textContent = "";
    els.documentsList.textContent = "";
    els.printBtn.classList.remove("show");
    try {
      const result = await apiFetch(`/api/sales/${encodeURIComponent(id)}`);
      renderDetails(result.sale);
    } catch (error) {
      els.detailTitle.textContent = error.message;
    }
  }

  async function printReceipt(id) {
    try {
      const result = await apiFetch(
        `/api/sales/${encodeURIComponent(id)}/receipt`,
      );
      const popup = window.open("", "_blank");
      if (!popup) {
        throw new Error("Permita pop-ups para imprimir o recibo.");
      }
      popup.opener = null;
      popup.document.open();
      popup.document.write(sanitizePrintableReceipt(result.html));
      popup.document.close();
      popup.addEventListener("load", () => popup.print());
    } catch (error) {
      window.alert(error.message);
    }
  }

  function sanitizePrintableReceipt(value) {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(
      typeof value === "string" ? value : "<p>Recibo indisponivel.</p>",
      "text/html",
    );
    parsed
      .querySelectorAll("script, iframe, object, embed, form, input, button, link")
      .forEach((node) => node.remove());
    parsed.querySelectorAll("*").forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const content = attribute.value.trim().toLowerCase();
        if (
          name.startsWith("on") ||
          ((name === "href" || name === "src") &&
            (content.startsWith("javascript:") || content.startsWith("data:")))
        ) {
          node.removeAttribute(attribute.name);
        }
      });
    });
    return `<!doctype html>${parsed.documentElement.outerHTML}`;
  }

  async function downloadDocument(saleId, documentInfo) {
    const format = documentInfo.hasPdf ? "pdf" : "xml";
    try {
      const result = await apiFetch(
        `/api/sales/${encodeURIComponent(saleId)}/documents/${encodeURIComponent(documentInfo.id)}/download?format=${format}`,
      );
      if (result.signedUrl) {
        window.open(result.signedUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      window.alert(error.message);
    }
  }

  function closeDetails() {
    state.selectedSale = null;
    els.overlay.classList.remove("active");
  }

  function bindEvents() {
    [els.searchSeller, els.filterDate, els.filterMinValue].forEach((input) => {
      input.addEventListener("input", () => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(() => {
          state.page = 1;
          loadSales();
        }, 250);
      });
    });
    [els.filterDocumentType, els.filterStatus].forEach((select) => {
      select.addEventListener("change", () => {
        state.page = 1;
        loadSales();
      });
    });
    els.closeModal.addEventListener("click", closeDetails);
    els.closeModal2.addEventListener("click", closeDetails);
    els.overlay.addEventListener("click", (event) => {
      if (event.target === els.overlay) closeDetails();
    });
  }

  async function init() {
    bindEvents();
    if (window.isNextStockDemoMode?.()) return;
    try {
      const valid = await bootstrapContext();
      if (!valid) return;
      await loadSales();
    } catch (error) {
      els.salesGrid.textContent = "";
      els.emptyMessage.style.display = "block";
      els.emptyMessage.textContent = error.message;
    }
  }

  init();
})();
