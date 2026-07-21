(function () {
  "use strict";

  const state = {
    profile: null,
    selectedBranch: null,
    cart: [],
    machines: [],
    lastSale: null,
    checkoutKey: null,
    busy: false,
    discountType: "percentage",
    discountValue: 0,
    searchTimer: null,
    searchController: null,
    searchSequence: 0,
    suggestions: [],
    activeSuggestion: -1,
    scanPending: false,
    printing: false,
    fiscalConfig: null,
    preview: false,
  };

  const els = {
    productList: document.getElementById("productList"),
    emptyState: document.getElementById("emptyState"),
    barcodeInput: document.getElementById("barcodeInput"),
    searchInput: document.getElementById("searchProductInput"),
    searchResults: document.getElementById("searchResults"),
    total: document.getElementById("totalVenda"),
    paid: document.getElementById("totalPago"),
    change: document.getElementById("trocoVenda"),
    status: document.getElementById("statusVenda"),
    pay: document.getElementById("pagarBtn"),
    discount: document.getElementById("descontoBtn"),
    cancelSale: document.getElementById("cancelarVendaBtn"),
    fiscal: document.getElementById("notaFiscalBtn"),
    receipt: document.getElementById("reciboBtn"),
    closeCash: document.getElementById("fecharCaixaBtn"),
    toggleSidebar: document.getElementById("toggleSidebarBtn"),
    paymentOverlay: document.getElementById("paymentOverlay"),
    closePayment: document.getElementById("closePaymentModal"),
    cancelPayment: document.getElementById("cancelarPagamentoBtn"),
    confirmPayment: document.getElementById("pagoBtn"),
    paymentMethod: document.getElementById("paymentMethod"),
    paymentValue: document.getElementById("paymentValue"),
    machineField: document.getElementById("machineField"),
    machine: document.getElementById("cardMachine"),
    modalTotal: document.getElementById("modalTotalVenda"),
    modalPaid: document.getElementById("modalTotalPago"),
    modalChange: document.getElementById("modalTroco"),
    modalMissing: document.getElementById("modalFaltante"),
    discountOverlay: document.getElementById("discountOverlay"),
    closeDiscount: document.getElementById("closeDiscountModal"),
    cancelDiscount: document.getElementById("cancelDiscountBtn"),
    applyDiscount: document.getElementById("applyDiscountBtn"),
    removeDiscount: document.getElementById("removeDiscountBtn"),
    discountType: document.getElementById("discountType"),
    discountValue: document.getElementById("discountValue"),
    toasts: document.getElementById("toastContainer"),
    model65Notice: document.getElementById("model65Notice"),
  };

  const PAYMENT_METHODS = {
    dinheiro: "cash",
    pix: "pix",
    debito: "debit_card",
    credito: "credit_card",
  };

  function normalizeScanCode(value) {
    return window.NextStockScanCode.normalize(value);
  }

  function money(cents) {
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function toast(message, tone) {
    const item = document.createElement("div");
    item.className = `toast ${tone || "info"}`;
    item.textContent = message;
    els.toasts.appendChild(item);
    window.setTimeout(() => item.remove(), 4200);
  }

  function supportHeader() {
    try {
      const support = JSON.parse(
        sessionStorage.getItem("nextstockDevSupportContext") || "null",
      );
      return support?.active === true &&
        support?.branchId === state.selectedBranch?.id
        ? "support"
        : "";
    } catch {
      return "";
    }
  }

  function headers(hasBody) {
    const result = { Accept: "application/json" };
    if (hasBody) result["Content-Type"] = "application/json";
    if (state.selectedBranch?.id) {
      result["x-nextstock-branch-id"] = state.selectedBranch.id;
    }
    const support = supportHeader();
    if (support) result["x-nextstock-dev-context"] = support;
    return result;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: {
        ...headers(Boolean(options?.body)),
        ...(options?.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = "./index.html";
      throw new Error("Sessao expirada.");
    }
    if (!response.ok) {
      const message = Array.isArray(data.message)
        ? data.message.join(" ")
        : data.message;
      throw new Error(message || "Nao foi possivel concluir a operacao.");
    }
    return data;
  }

  function setStatus(title, message) {
    const strong = document.createElement("strong");
    strong.textContent = title;
    els.status.replaceChildren(strong, document.createTextNode(message));
  }

  function subtotalCents() {
    return state.cart.reduce(
      (sum, item) => sum + item.salePriceCents * item.quantity,
      0,
    );
  }

  function discountCents() {
    const subtotal = subtotalCents();
    if (state.discountValue <= 0) return 0;
    if (state.discountType === "percentage") {
      return Math.round(subtotal * (state.discountValue / 100));
    }
    return Math.round(state.discountValue);
  }

  function totalCents() {
    return Math.max(subtotalCents() - discountCents(), 0);
  }

  function resetCheckoutIntent() {
    state.checkoutKey = null;
    state.lastSale = null;
  }

  function setBusy(busy) {
    state.busy = busy;
    [
      els.pay,
      els.confirmPayment,
      els.cancelSale,
      els.discount,
      els.barcodeInput,
      els.searchInput,
    ].forEach((element) => {
      element.disabled =
        busy ||
        (state.preview &&
          [els.pay, els.confirmPayment, els.closeCash].includes(element));
    });
  }

  function updateSummary() {
    els.total.textContent = money(totalCents());
    const sale = state.lastSale;
    els.paid.textContent = money(sale?.paidCents || 0);
    els.change.textContent = money(sale?.changeCents || 0);
    els.receipt.disabled = !sale;
    els.fiscal.disabled = !sale;

    if (sale) {
      setStatus(
        "Venda concluida",
        ` Venda ${sale.id} confirmada pelo backend.`,
      );
    } else if (state.cart.length) {
      setStatus(
        "Venda em andamento",
        ` Total previsto: ${money(totalCents())}.`,
      );
    } else {
      setStatus("Status da venda", " Nenhuma compra em andamento.");
    }
  }

  function createButton(label, action, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btnLista";
    button.textContent = label;
    button.disabled = Boolean(disabled);
    button.addEventListener("click", action);
    return button;
  }

  function changeQuantity(productId, nextQuantity) {
    const item = state.cart.find((entry) => entry.id === productId);
    if (!item) return;
    const quantity = Math.max(
      0,
      Math.min(Math.floor(Number(nextQuantity) || 0), item.availableQuantity),
    );
    if (quantity === 0) {
      state.cart = state.cart.filter((entry) => entry.id !== productId);
    } else {
      item.quantity = quantity;
    }
    resetCheckoutIntent();
    renderCart();
  }

  function renderCart() {
    if (!state.cart.length) {
      els.productList.replaceChildren(els.emptyState);
      els.emptyState.style.display = "flex";
      updateSummary();
      return;
    }

    const fragment = document.createDocumentFragment();
    state.cart.forEach((product) => {
      const row = document.createElement("div");
      row.className = "item";

      const info = document.createElement("div");
      info.className = "produto-info";
      const name = document.createElement("div");
      name.className = "produto-nome";
      name.textContent = product.name;
      const code = document.createElement("div");
      code.className = "produto-codigo";
      code.textContent = `Codigo: ${product.barcode || product.sku || product.id}`;
      const type = document.createElement("div");
      type.className = "produto-tipo";
      type.textContent = "Venda por unidade";
      info.append(name, code, type);

      const price = document.createElement("div");
      price.className = "precoUnidade";
      price.textContent = `${money(product.salePriceCents)} / un.`;

      const controls = document.createElement("div");
      controls.className = "controle-qtd";
      const input = document.createElement("input");
      input.type = "number";
      input.className = "qtdInput";
      input.min = "1";
      input.max = String(product.availableQuantity);
      input.step = "1";
      input.value = String(product.quantity);
      input.addEventListener("change", () =>
        changeQuantity(product.id, input.value),
      );
      controls.append(
        createButton("-", () =>
          changeQuantity(product.id, product.quantity - 1),
        ),
        input,
        createButton(
          "+",
          () => changeQuantity(product.id, product.quantity + 1),
          product.quantity >= product.availableQuantity,
        ),
      );

      const lineTotal = document.createElement("input");
      lineTotal.className = "totalLinha";
      lineTotal.readOnly = true;
      lineTotal.value = money(product.salePriceCents * product.quantity);

      row.append(info, price, controls, lineTotal);
      fragment.appendChild(row);
    });
    els.productList.replaceChildren(fragment);
    updateSummary();
  }

  function addProduct(product) {
    if (product.saleMode === "weighed") {
      toast(
        "Venda por granel esta bloqueada ate o estoque usar quantidade fracionada no backend.",
        "warning",
      );
      return;
    }
    if (product.quantity <= 0) {
      toast("Produto sem estoque disponivel.", "warning");
      return;
    }
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      if (existing.quantity >= existing.availableQuantity) {
        toast("Quantidade maxima disponivel atingida.", "warning");
        return;
      }
      existing.quantity += 1;
    } else {
      state.cart.push({
        ...product,
        availableQuantity: product.quantity,
        quantity: 1,
      });
    }
    resetCheckoutIntent();
    closeSearchResults();
    renderCart();
  }

  function closeSearchResults() {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = null;
    state.searchController?.abort();
    state.searchController = null;
    state.searchSequence += 1;
    state.suggestions = [];
    state.activeSuggestion = -1;
    els.searchResults.classList.remove("open");
    els.searchResults.replaceChildren();
    els.searchInput.setAttribute("aria-expanded", "false");
    els.searchInput.removeAttribute("aria-activedescendant");
  }

  function renderSearchResults(products) {
    state.suggestions = products.slice(0, 10);
    state.activeSuggestion = -1;
    const fragment = document.createDocumentFragment();
    state.suggestions.forEach((product, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.id = `product-suggestion-${state.searchSequence}-${index}`;
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", "false");
      button.textContent = `${product.name} | ${
        product.barcode || product.sku || "sem codigo"
      } | ${money(product.salePriceCents)} | estoque ${product.quantity}`;
      button.addEventListener("click", () => selectSuggestion(index));
      fragment.appendChild(button);
    });
    els.searchResults.replaceChildren(fragment);
    els.searchResults.classList.toggle("open", state.suggestions.length > 0);
    els.searchInput.setAttribute(
      "aria-expanded",
      state.suggestions.length > 0 ? "true" : "false",
    );
  }

  function renderSearchState(message, tone) {
    state.suggestions = [];
    state.activeSuggestion = -1;
    const status = document.createElement("div");
    status.className = `search-result-state${tone === "error" ? " error" : ""}`;
    status.setAttribute("role", "status");
    status.textContent = message;
    els.searchResults.replaceChildren(status);
    els.searchResults.classList.add("open");
    els.searchInput.setAttribute("aria-expanded", "true");
    els.searchInput.removeAttribute("aria-activedescendant");
  }

  function setActiveSuggestion(index) {
    if (!state.suggestions.length) return;
    const next = (index + state.suggestions.length) % state.suggestions.length;
    state.activeSuggestion = next;
    const options = Array.from(
      els.searchResults.querySelectorAll('[role="option"]'),
    );
    options.forEach((option, optionIndex) => {
      const active = optionIndex === next;
      option.classList.toggle("active", active);
      option.setAttribute("aria-selected", active ? "true" : "false");
      if (active) {
        els.searchInput.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function selectSuggestion(index) {
    const product = state.suggestions[index];
    if (!product) return;
    addProduct(product);
    els.searchInput.value = "";
    closeSearchResults();
    els.searchInput.focus();
  }

  async function lookupProduct(value) {
    let term = "";
    try {
      term = normalizeScanCode(value);
    } catch (error) {
      toast(error.message, "error");
      return;
    }
    if (!term) return;
    if (state.scanPending) return;
    state.scanPending = true;
    setBusy(true);
    try {
      const query = new URLSearchParams({ barcode: term, limit: "1" });
      const result = await api(`/api/products/lookup?${query}`);
      const products = Array.isArray(result.products) ? result.products : [];
      if (!products.length) {
        toast("Produto nao encontrado ou sem estoque nesta filial.", "warning");
        return;
      }
      addProduct(products[0]);
    } catch (error) {
      toast(error.message, "error");
    } finally {
      state.scanPending = false;
      setBusy(false);
      els.barcodeInput.focus();
    }
  }

  function scheduleAutocomplete() {
    window.clearTimeout(state.searchTimer);
    state.searchController?.abort();
    state.searchController = null;
    const sequence = ++state.searchSequence;
    const term = els.searchInput.value.normalize("NFC").trim();

    if (term.length < 2) {
      closeSearchResults();
      return;
    }

    renderSearchState("Buscando produtos...");
    state.searchTimer = window.setTimeout(async () => {
      const controller = new AbortController();
      state.searchController = controller;
      try {
        const query = new URLSearchParams({
          search: term,
          limit: "10",
        });
        const result = await api(`/api/products/lookup?${query}`, {
          signal: controller.signal,
        });
        if (
          sequence !== state.searchSequence ||
          term !== els.searchInput.value.normalize("NFC").trim()
        ) {
          return;
        }
        const products = Array.isArray(result.products)
          ? result.products.slice(0, 10)
          : [];
        if (!products.length) {
          renderSearchState("Nenhum produto encontrado.");
          return;
        }
        renderSearchResults(products);
      } catch (error) {
        if (error.name === "AbortError" || sequence !== state.searchSequence) {
          return;
        }
        renderSearchState(error.message, "error");
      } finally {
        if (sequence === state.searchSequence) {
          state.searchController = null;
        }
      }
    }, 250);
  }

  async function loadMachines() {
    const result = await api("/api/payment-machines");
    state.machines = (result.machines || []).filter(
      (machine) => machine.status === "ativa",
    );
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Selecione a maquininha";
    const options = state.machines.map((machine) => {
      const option = document.createElement("option");
      option.value = machine.id;
      option.textContent = `${machine.name} - ${machine.provider} - ${machine.model}`;
      return option;
    });
    els.machine.replaceChildren(placeholder, ...options);
  }

  function paymentTotals() {
    const total = totalCents();
    const paid = Math.round(Number(els.paymentValue.value || 0) * 100);
    return {
      total,
      paid,
      change: Math.max(paid - total, 0),
      missing: Math.max(total - paid, 0),
    };
  }

  function updatePaymentSummary() {
    const values = paymentTotals();
    els.modalTotal.textContent = money(values.total);
    els.modalPaid.textContent = money(values.paid);
    els.modalChange.textContent = money(values.change);
    els.modalMissing.textContent = money(values.missing);
  }

  function updatePaymentMethod() {
    const isCard = ["debito", "credito"].includes(els.paymentMethod.value);
    els.machineField.style.display = isCard ? "flex" : "none";
    els.machine.value = "";
    const isCash = els.paymentMethod.value === "dinheiro";
    els.paymentValue.readOnly = !isCash;
    if (!isCash) {
      els.paymentValue.value = (totalCents() / 100).toFixed(2);
    }
    state.checkoutKey = null;
    updatePaymentSummary();
  }

  function openPayment() {
    if (!state.cart.length) {
      toast("Adicione produtos antes de iniciar o pagamento.", "warning");
      return;
    }
    els.paymentMethod.value = "dinheiro";
    els.paymentValue.readOnly = false;
    els.paymentValue.value = (totalCents() / 100).toFixed(2);
    els.machine.value = "";
    els.machineField.style.display = "none";
    updatePaymentSummary();
    els.paymentOverlay.classList.add("open");
  }

  function closePayment() {
    els.paymentOverlay.classList.remove("open");
  }

  function uuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (value) => {
      const random = Math.floor(Math.random() * 16);
      const next = value === "x" ? random : (random & 3) | 8;
      return next.toString(16);
    });
  }

  async function checkout() {
    if (state.busy || !state.cart.length) return;
    const method = PAYMENT_METHODS[els.paymentMethod.value];
    const totals = paymentTotals();
    if (totals.paid < totals.total) {
      toast("O valor pago e menor que o total da venda.", "error");
      return;
    }
    const isCard = ["credit_card", "debit_card"].includes(method);
    if (isCard && !els.machine.value) {
      toast("Selecione uma maquininha ativa.", "warning");
      return;
    }

    state.checkoutKey ||= uuid();
    const body = {
      idempotencyKey: state.checkoutKey,
      items: state.cart.map((item) => ({
        productId: item.id,
        quantity: item.quantity,
      })),
      paymentMethod: method,
      paidCents: totals.paid,
    };
    if (isCard) body.paymentMachineId = els.machine.value;
    if (state.discountValue > 0) {
      body.discountType = state.discountType;
      body.discountValue =
        state.discountType === "fixed"
          ? Math.round(state.discountValue)
          : state.discountValue;
    }

    setBusy(true);
    setStatus("Processando pagamento", " Aguarde a confirmacao do backend.");
    try {
      const result = await api("/api/sales", {
        method: "POST",
        body: JSON.stringify(body),
      });
      state.lastSale = result.sale;
      state.cart = [];
      state.discountType = "percentage";
      state.discountValue = 0;
      state.checkoutKey = null;
      closePayment();
      renderCart();
      toast(
        result.idempotent
          ? "Venda ja processada anteriormente; o registro existente foi recuperado."
          : "Venda concluida e estoque atualizado.",
        "success",
      );
      await printReceipt();
    } catch (error) {
      setStatus("Pagamento nao concluido", ` ${error.message}`);
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function printReceipt() {
    if (!state.lastSale?.id) {
      toast("Conclua uma venda antes de imprimir o recibo.", "warning");
      return;
    }
    if (state.printing) return;
    state.printing = true;
    els.receipt.disabled = true;
    try {
      const result = await api(
        `/api/sales/${encodeURIComponent(state.lastSale.id)}/model-65/print`,
        { method: "POST" },
      );
      if (result.mode === "nfce65" && !result.html) {
        toast(
          "NFC-e autorizada. A impressão fiscal ficará disponível no histórico.",
          "success",
        );
        return;
      }
      if (result.mode !== "internal_receipt" || !result.html) {
        throw new Error("Nenhum documento imprimível foi retornado.");
      }
      const frame = document.createElement("iframe");
      frame.hidden = true;
      document.body.appendChild(frame);
      frame.contentDocument.open();
      frame.contentDocument.write(result.html);
      frame.contentDocument.close();
      window.setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        window.setTimeout(() => frame.remove(), 1000);
      }, 50);
      toast(
        "Recibo interno gerado — documento sem validade fiscal.",
        "warning",
      );
    } catch (error) {
      toast(error.message, "error");
    } finally {
      state.printing = false;
      els.receipt.disabled = !state.lastSale;
    }
  }

  function renderModel65Mode(config) {
    state.fiscalConfig = config;
    const certificate = config?.certificate;
    const certificateValid =
      certificate?.status === "valid" &&
      certificate?.expiresAt &&
      new Date(certificate.expiresAt) > new Date();
    els.receipt.textContent = certificateValid
      ? "EMITIR NFC-e"
      : "IMPRIMIR RECIBO INTERNO";
    els.model65Notice.textContent = certificateValid
      ? "Certificado A1 válido — o backend tentará a NFC-e por até 5 segundos; em caso de indisponibilidade, imprimirá recibo interno sem validade fiscal."
      : "Sem certificado A1 válido — será impresso recibo interno, sem validade fiscal.";
  }

  function openFiscal() {
    if (!state.lastSale?.id) {
      toast("Conclua uma venda antes de abrir a nota fiscal.", "warning");
      return;
    }
    window.location.href = `ntfe.html?saleId=${encodeURIComponent(
      state.lastSale.id,
    )}`;
  }

  function openDiscount() {
    if (!state.cart.length) {
      toast("Adicione produtos antes de aplicar desconto.", "warning");
      return;
    }
    els.discountType.value =
      state.discountType === "percentage" ? "percentual" : "fixo";
    els.discountValue.value =
      state.discountType === "fixed"
        ? (state.discountValue / 100).toFixed(2)
        : String(state.discountValue || "");
    els.discountOverlay.classList.add("open");
  }

  function applyDiscount() {
    const type = els.discountType.value === "fixo" ? "fixed" : "percentage";
    const entered = Number(els.discountValue.value || 0);
    if (!Number.isFinite(entered) || entered < 0) {
      toast("Informe um desconto valido.", "warning");
      return;
    }
    const isAdmin =
      state.profile?.user?.role === "Admin" || state.profile?.role === "Admin";
    const maxPercentage = isAdmin ? 100 : 10;
    if (type === "percentage" && entered > maxPercentage) {
      toast(`Seu limite de desconto e ${maxPercentage}%.`, "warning");
      return;
    }
    const fixedCents = Math.round(entered * 100);
    const sellerFixedLimit = Math.floor(subtotalCents() * 0.1);
    if (
      type === "fixed" &&
      fixedCents > (isAdmin ? subtotalCents() : sellerFixedLimit)
    ) {
      toast("O desconto excede o limite permitido.", "warning");
      return;
    }
    state.discountType = type;
    state.discountValue = type === "fixed" ? fixedCents : entered;
    resetCheckoutIntent();
    els.discountOverlay.classList.remove("open");
    updateSummary();
    toast("Desconto aplicado para validacao final do backend.", "success");
  }

  function clearSale() {
    if (!state.cart.length) {
      toast("Nao ha compra em andamento.", "info");
      return;
    }
    if (!window.confirm("Deseja limpar a compra atual?")) return;
    state.cart = [];
    state.discountType = "percentage";
    state.discountValue = 0;
    resetCheckoutIntent();
    renderCart();
  }

  async function bootstrap() {
    if (window.isNextStockDemoMode?.()) {
      state.preview = true;
      renderCart();
      setStatus("Modo visualizacao", " Navegacao demonstrativa; operacoes bloqueadas.");
      toast("Modo visualizacao: nenhuma operacao sera enviada ao backend.", "info");
      return;
    }
    setBusy(true);
    setStatus("Carregando caixa", " Validando sessao e filial.");
    try {
      const profile = await api("/api/auth/profile");
      const context = await api("/api/system/context");
      window.setNextStockBackendContext?.(context);
      state.profile = profile;
      state.preview = String(context.systemMode).toUpperCase() === "PREVIEW";
      state.selectedBranch = context.selectedBranch || context.branch || null;
      if (!state.selectedBranch?.id) {
        throw new Error("Selecione uma filial valida para operar o caixa.");
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
      const fiscal = await api("/api/fiscal/config");
      renderModel65Mode(fiscal.config);
      await loadMachines();
      renderCart();
      if (state.preview) {
        toast(
          "Modo visualização: consultas liberadas e ações de venda bloqueadas.",
          "info",
        );
      }
    } catch (error) {
      setStatus("Caixa indisponivel", ` ${error.message}`);
      toast(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  els.barcodeInput.addEventListener("keydown", (event) => {
    if (!["Enter", "Tab"].includes(event.key)) return;
    event.preventDefault();
    const scannedValue = els.barcodeInput.value;
    els.barcodeInput.value = "";
    lookupProduct(scannedValue);
  });
  els.searchInput.addEventListener("input", scheduleAutocomplete);
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion(state.activeSuggestion + 1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(
        state.activeSuggestion < 0
          ? state.suggestions.length - 1
          : state.activeSuggestion - 1,
      );
      return;
    }
    if (event.key === "Enter" && state.suggestions.length) {
      event.preventDefault();
      selectSuggestion(
        state.activeSuggestion >= 0 ? state.activeSuggestion : 0,
      );
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closeSearchResults();
    }
  });
  els.pay.addEventListener("click", openPayment);
  els.confirmPayment.addEventListener("click", checkout);
  els.closePayment.addEventListener("click", closePayment);
  els.cancelPayment.addEventListener("click", closePayment);
  els.paymentMethod.addEventListener("change", updatePaymentMethod);
  els.paymentValue.addEventListener("input", updatePaymentSummary);
  els.discount.addEventListener("click", openDiscount);
  els.closeDiscount.addEventListener("click", () =>
    els.discountOverlay.classList.remove("open"),
  );
  els.cancelDiscount.addEventListener("click", () =>
    els.discountOverlay.classList.remove("open"),
  );
  els.applyDiscount.addEventListener("click", applyDiscount);
  els.removeDiscount.addEventListener("click", () => {
    state.discountType = "percentage";
    state.discountValue = 0;
    resetCheckoutIntent();
    els.discountOverlay.classList.remove("open");
    updateSummary();
  });
  els.cancelSale.addEventListener("click", clearSale);
  els.receipt.addEventListener("click", printReceipt);
  els.fiscal.addEventListener("click", openFiscal);
  els.closeCash.addEventListener("click", () =>
    toast("Fechamento de caixa ainda nao esta configurado no backend.", "info"),
  );
  els.toggleSidebar.addEventListener("click", () => {
    document.body.classList.toggle("sidebar-hidden");
    els.toggleSidebar.textContent = document.body.classList.contains(
      "sidebar-hidden",
    )
      ? "MOSTRAR"
      : "ESCONDER";
  });
  document.addEventListener("click", (event) => {
    if (
      event.target !== els.searchInput &&
      !els.searchResults.contains(event.target)
    ) {
      closeSearchResults();
    }
  });

  bootstrap();
})();
