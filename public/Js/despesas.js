(function () {
  const state = {
    expenses: [],
    selectedBranch: null,
    editingId: null,
    currentMode: "written",
    formProducts: [],
    newFiles: [],
    existingFiles: [],
    carouselIndex: 0,
    busy: false,
    searchTimer: null,
    preview: false,
  };

  const els = {
    expensesGrid: document.getElementById("expensesGrid"),
    emptyMessage: document.getElementById("emptyMessage"),
    searchExpense: document.getElementById("searchExpense"),
    filterDate: document.getElementById("filterDate"),
    filterMinValue: document.getElementById("filterMinValue"),
    btnCreateExpense: document.getElementById("btnCreateExpense"),
    createOptions: document.getElementById("createOptions"),
    btnCreateWritten: document.getElementById("btnCreateWritten"),
    btnCreateUpload: document.getElementById("btnCreateUpload"),
    formOverlay: document.getElementById("formOverlay"),
    formTitle: document.getElementById("formTitle"),
    closeFormModal: document.getElementById("closeFormModal"),
    btnCancelForm: document.getElementById("btnCancelForm"),
    btnSaveExpense: document.getElementById("btnSaveExpense"),
    expenseTotal: document.getElementById("expenseTotal"),
    expenseDate: document.getElementById("expenseDate"),
    expenseEmployee: document.getElementById("expenseEmployee"),
    expenseStore: document.getElementById("expenseStore"),
    writtenSection: document.getElementById("writtenSection"),
    uploadSection: document.getElementById("uploadSection"),
    productName: document.getElementById("productName"),
    productUnits: document.getElementById("productUnits"),
    productCost: document.getElementById("productCost"),
    btnAddProduct: document.getElementById("btnAddProduct"),
    formProductsList: document.getElementById("formProductsList"),
    expenseFiles: document.getElementById("expenseFiles"),
    filePreviewList: document.getElementById("filePreviewList"),
    detailOverlay: document.getElementById("detailOverlay"),
    detailTitle: document.getElementById("detailTitle"),
    detailSummary: document.getElementById("detailSummary"),
    detailWrittenArea: document.getElementById("detailWrittenArea"),
    detailUploadArea: document.getElementById("detailUploadArea"),
    closeDetailModal: document.getElementById("closeDetailModal"),
    closeDetailModal2: document.getElementById("closeDetailModal2"),
  };

  const statusMessage = document.createElement("div");
  statusMessage.className = "empty-message";
  statusMessage.style.marginBottom = "16px";
  statusMessage.style.display = "none";
  document.querySelector(".main")?.insertBefore(statusMessage, els.expensesGrid);

  function setMessage(message, type) {
    statusMessage.textContent = message || "";
    statusMessage.style.display = message ? "block" : "none";
    statusMessage.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#166534" : "#23384d";
  }

  function setBusy(isBusy) {
    state.busy = isBusy;
    [els.btnSaveExpense, els.btnAddProduct, els.btnCreateExpense].forEach((button) => {
      if (button) button.disabled = isBusy || state.preview;
    });
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function toCents(value) {
    return Math.round(Number(value || 0) * 100);
  }

  function centsToMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatMoneyCents(value) {
    return centsToMoney(Number(value || 0) / 100);
  }

  function dateToInput(value) {
    if (!value) return "";
    return String(value).slice(0, 10);
  }

  function formatDate(value) {
    const input = dateToInput(value);
    if (!input) return "-";
    const [year, month, day] = input.split("-");
    return `${day}/${month}/${year}`;
  }

  function getTypeLabel(type) {
    return type === "written" ? "Nota escrita" : "Nota por upload";
  }

  function getStatusLabel(status) {
    const labels = {
      draft: "Rascunho",
      pending: "Pendente",
      approved: "Aprovada",
      paid: "Paga",
      canceled: "Cancelada",
    };
    return labels[status] || status || "Pendente";
  }

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text == null ? "" : String(text);
    parent.appendChild(element);
    return element;
  }

  function getSupportContextHeader() {
    try {
      const support = JSON.parse(sessionStorage.getItem("nextstockDevSupportContext") || "null");
      return support?.active === true ? "support" : "";
    } catch {
      return "";
    }
  }

  function buildHeaders(extra) {
    const headers = {
      Accept: "application/json",
      ...(extra || {}),
    };
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
    if (!response.ok) {
      throw new Error(body.message || "Nao foi possivel concluir a operacao.");
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
      throw new Error("Usuario sem permissao para acessar despesas.");
    }
    if (!profileResponse.ok) {
      throw new Error("Sessao expirada ou invalida.");
    }

    const contextResponse = await fetch("/api/system/context", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    if (!contextResponse.ok) {
      throw new Error("Nao foi possivel validar o contexto do sistema.");
    }

    const context = await contextResponse.json();
    state.preview = String(context.systemMode).toUpperCase() === "PREVIEW";
    window.setNextStockBackendContext?.(context);
    state.selectedBranch = context.selectedBranch || context.branch || null;
    if (!state.selectedBranch?.id) {
      throw new Error("Selecione uma filial valida para gerenciar despesas.");
    }

    sessionStorage.setItem("nextstockSelectedBranch", JSON.stringify(state.selectedBranch));
    sessionStorage.setItem("nextstockBranchId", state.selectedBranch.id);
    sessionStorage.setItem("nextstockTenantId", state.selectedBranch.tenantId || "");
    return true;
  }

  function buildQueryString() {
    const params = new URLSearchParams();
    const search = clean(els.searchExpense.value);
    const date = els.filterDate.value;
    const minValue = toCents(els.filterMinValue.value);
    if (search) params.set("search", search);
    if (date) params.set("date", date);
    if (minValue > 0) params.set("minValue", String(minValue));
    params.set("page", "1");
    params.set("pageSize", "100");
    return params.toString();
  }

  async function loadExpenses() {
    els.expensesGrid.textContent = "";
    appendText(els.expensesGrid, "div", "Carregando despesas...", "empty-message");
    els.emptyMessage.style.display = "none";

    try {
      const data = await apiFetch(`/api/expenses?${buildQueryString()}`);
      state.expenses = Array.isArray(data.items) ? data.items : [];
      renderExpenses();
      setMessage("", "info");
    } catch (error) {
      state.expenses = [];
      renderExpenses();
      setMessage(error.message, "error");
    }
  }

  function renderExpenses() {
    els.expensesGrid.textContent = "";
    if (!state.expenses.length) {
      els.emptyMessage.style.display = "block";
      return;
    }
    els.emptyMessage.style.display = "none";

    state.expenses.forEach((expense) => {
      const card = document.createElement("div");
      card.className = "expense-card";
      card.addEventListener("click", () => openDetails(expense.id));

      const top = document.createElement("div");
      top.className = "card-top";
      appendText(top, "div", getTypeLabel(expense.type), `type-badge ${expense.type}`);
      appendText(top, "div", `#DESP-${String(expense.id).slice(0, 8)}`, "expense-id");
      card.appendChild(top);

      appendText(card, "div", expense.storeName || expense.store || "-", "expense-title");
      const status = appendText(card, "div", getStatusLabel(expense.status), "type-badge");
      status.style.marginTop = "10px";

      const info = document.createElement("div");
      info.className = "expense-info";
      addInfo(info, "Valor total da nota", formatMoneyCents(expense.totalCents));
      addInfo(info, "Data da nota", formatDate(expense.date));
      addInfo(info, "Empregado emissor", expense.employeeName || "-");
      addInfo(info, "Loja emissora", expense.storeName || "-");
      card.appendChild(info);

      const actions = document.createElement("div");
      actions.className = "card-actions";
      const edit = document.createElement("button");
      edit.className = "btn btn-edit";
      edit.textContent = "Alterar";
      edit.addEventListener("click", (event) => {
        event.stopPropagation();
        openEditForm(expense.id);
      });
      const remove = document.createElement("button");
      remove.className = "btn btn-delete";
      remove.textContent = "Apagar";
      remove.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteExpense(expense.id);
      });
      actions.append(edit, remove);
      card.appendChild(actions);
      els.expensesGrid.appendChild(card);
    });
  }

  function addInfo(parent, label, value) {
    const box = document.createElement("div");
    box.className = "info-box";
    appendText(box, "span", label);
    appendText(box, "strong", value);
    parent.appendChild(box);
  }

  function resetForm() {
    state.editingId = null;
    state.formProducts = [];
    state.newFiles = [];
    state.existingFiles = [];
    els.expenseTotal.value = "";
    els.expenseDate.value = "";
    els.expenseEmployee.value = "";
    els.expenseStore.value = "";
    els.productName.value = "";
    els.productUnits.value = "";
    els.productCost.value = "";
    els.expenseFiles.value = "";
    renderFormProducts();
    renderFilePreview();
  }

  function openCreateForm(mode) {
    resetForm();
    state.currentMode = mode;
    els.formTitle.textContent = mode === "written" ? "Criar nota escrita de despesa" : "Criar nota por upload";
    els.writtenSection.style.display = mode === "written" ? "block" : "none";
    els.uploadSection.style.display = mode === "upload" ? "block" : "none";
    els.formOverlay.classList.add("active");
    els.createOptions.classList.remove("active");
  }

  function openEditForm(id) {
    const expense = state.expenses.find((item) => item.id === id);
    if (!expense) return;
    resetForm();
    state.editingId = id;
    state.currentMode = expense.type;
    state.formProducts = (expense.items || expense.products || []).map((item) => ({
      productName: item.productName || item.name,
      units: item.units,
      totalCostCents: item.totalCostCents ?? toCents(item.cost),
      productId: item.productId || undefined,
    }));
    state.existingFiles = [...(expense.files || [])];
    els.formTitle.textContent = expense.type === "written" ? "Alterar nota escrita" : "Alterar nota por upload";
    els.expenseTotal.value = ((expense.totalCents || 0) / 100).toFixed(2);
    els.expenseDate.value = dateToInput(expense.date);
    els.expenseEmployee.value = expense.employeeName || "";
    els.expenseStore.value = expense.storeName || "";
    els.writtenSection.style.display = expense.type === "written" ? "block" : "none";
    els.uploadSection.style.display = expense.type === "upload" ? "block" : "none";
    renderFormProducts();
    renderFilePreview();
    els.formOverlay.classList.add("active");
  }

  function closeForm() {
    els.formOverlay.classList.remove("active");
    resetForm();
  }

  function addProductToForm() {
    const productName = clean(els.productName.value);
    const units = Number(els.productUnits.value);
    const totalCostCents = toCents(els.productCost.value);
    if (!productName || !Number.isInteger(units) || units < 1 || totalCostCents < 0) {
      alert("Preencha nome do produto, unidades e custo total.");
      return;
    }
    state.formProducts.push({ productName, units, totalCostCents });
    els.productName.value = "";
    els.productUnits.value = "";
    els.productCost.value = "";
    renderFormProducts();
    updateTotalFromProducts();
  }

  function renderFormProducts() {
    els.formProductsList.textContent = "";
    const header = document.createElement("div");
    header.className = "product-row header-row";
    ["Produto", "Unidades", "Custo total", "Acao"].forEach((text) => appendText(header, "div", text));
    els.formProductsList.appendChild(header);

    state.formProducts.forEach((product, index) => {
      const row = document.createElement("div");
      row.className = "product-row";
      appendText(row, "div", product.productName);
      appendText(row, "div", product.units);
      appendText(row, "div", formatMoneyCents(product.totalCostCents));
      const action = document.createElement("div");
      const button = document.createElement("button");
      button.className = "btn-remove-product";
      button.textContent = "Remover";
      button.addEventListener("click", () => {
        state.formProducts.splice(index, 1);
        renderFormProducts();
        updateTotalFromProducts();
      });
      action.appendChild(button);
      row.appendChild(action);
      els.formProductsList.appendChild(row);
    });
  }

  function updateTotalFromProducts() {
    if (state.currentMode !== "written") return;
    const total = state.formProducts.reduce((sum, product) => sum + product.totalCostCents, 0);
    els.expenseTotal.value = (total / 100).toFixed(2);
  }

  function handleFileUpload(event) {
    const files = Array.from(event.target.files || []);
    if (state.existingFiles.length + state.newFiles.length + files.length > 5) {
      alert("Cada nota pode ter no maximo 5 arquivos.");
      els.expenseFiles.value = "";
      return;
    }

    files.forEach((file) => {
      if (!isAcceptedFile(file)) {
        alert(`Arquivo nao aceito: ${file.name}`);
        return;
      }
      state.newFiles.push(file);
    });
    els.expenseFiles.value = "";
    renderFilePreview();
  }

  function isAcceptedFile(file) {
    return (
      file.type.startsWith("image/") ||
      file.type === "application/pdf" ||
      file.type === "application/msword" ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx?$/i.test(file.name)
    );
  }

  function renderFilePreview() {
    els.filePreviewList.textContent = "";
    [...state.existingFiles.map((file) => ({ ...file, existing: true })), ...state.newFiles.map((file) => ({ name: file.name }))].forEach((file, index) => {
      const row = document.createElement("div");
      row.className = "file-preview";
      appendText(row, "span", file.name || file.fileName);
      const button = document.createElement("button");
      button.textContent = "Remover";
      button.addEventListener("click", async () => {
        if (file.existing && state.editingId) {
          await deleteFile(state.editingId, file.id);
        } else {
          state.newFiles.splice(index - state.existingFiles.length, 1);
          renderFilePreview();
        }
      });
      row.appendChild(button);
      els.filePreviewList.appendChild(row);
    });
  }

  function buildPayload() {
    const type = state.currentMode;
    const totalCents = toCents(els.expenseTotal.value);
    const date = els.expenseDate.value;
    const employeeName = clean(els.expenseEmployee.value);
    const storeName = clean(els.expenseStore.value);
    if (!date || !employeeName || !storeName) {
      throw new Error("Preencha data, empregado emissor e loja emissora.");
    }
    if (type === "written" && state.formProducts.length === 0) {
      throw new Error("Adicione pelo menos um produto na nota escrita.");
    }
    if (type === "upload" && !state.editingId && state.newFiles.length === 0) {
      throw new Error("Adicione pelo menos um arquivo na nota por upload.");
    }
    return {
      type,
      totalCents,
      date,
      employeeName,
      storeName,
      items: type === "written" ? state.formProducts : undefined,
    };
  }

  async function saveExpense() {
    if (state.busy) return;
    try {
      setBusy(true);
      const payload = buildPayload();
      const result = state.editingId
        ? await apiFetch(`/api/expenses/${state.editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await apiFetch("/api/expenses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const expenseId = result.expense?.id || state.editingId;
      for (const file of state.newFiles) {
        await uploadFile(expenseId, file);
      }
      closeForm();
      await loadExpenses();
      setMessage("Despesa salva com sucesso.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(expenseId, file) {
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/expenses/${expenseId}/files/upload`, {
      method: "POST",
      credentials: "include",
      headers: buildHeaders(),
      body: formData,
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || `Falha ao enviar ${file.name}.`);
      return body;
    });
  }

  async function deleteFile(expenseId, fileId) {
    try {
      await apiFetch(`/api/expenses/${expenseId}/files/${fileId}`, { method: "DELETE" });
      state.existingFiles = state.existingFiles.filter((file) => file.id !== fileId);
      renderFilePreview();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function deleteExpense(id) {
    if (!confirm("Deseja apagar esta nota de despesa?")) return;
    try {
      await apiFetch(`/api/expenses/${id}`, { method: "DELETE" });
      await loadExpenses();
      setMessage("Despesa apagada com sucesso.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function openDetails(id) {
    try {
      const data = await apiFetch(`/api/expenses/${id}`);
      const expense = data.expense;
      if (!expense) return;
      state.carouselIndex = 0;
      els.detailTitle.textContent = `${getTypeLabel(expense.type)} - #DESP-${String(expense.id).slice(0, 8)}`;
      renderDetailSummary(expense);
      els.detailWrittenArea.textContent = "";
      els.detailUploadArea.textContent = "";
      if (expense.type === "written") renderDetailItems(expense);
      if (expense.files?.length) renderCarousel(expense);
      els.detailOverlay.classList.add("active");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function renderDetailSummary(expense) {
    els.detailSummary.textContent = "";
    addSummary("Valor total", formatMoneyCents(expense.totalCents));
    addSummary("Data", formatDate(expense.date));
    addSummary("Empregado emissor", expense.employeeName || "-");
    addSummary("Loja emissora", expense.storeName || "-");
    addSummary("Status", getStatusLabel(expense.status));
  }

  function addSummary(label, value) {
    const card = document.createElement("div");
    card.className = "summary-card";
    appendText(card, "span", label);
    appendText(card, "strong", value);
    els.detailSummary.appendChild(card);
  }

  function renderDetailItems(expense) {
    const wrapper = document.createElement("div");
    wrapper.className = "detail-products";
    appendText(wrapper, "div", "Produtos da nota", "detail-products-title");
    const list = document.createElement("div");
    list.className = "detail-products-scroll";
    const header = document.createElement("div");
    header.className = "product-row header-row";
    ["Produto", "Unidades", "Custo total", ""].forEach((text) => appendText(header, "div", text));
    list.appendChild(header);
    (expense.items || []).forEach((product) => {
      const row = document.createElement("div");
      row.className = "product-row";
      appendText(row, "div", product.productName || product.name);
      appendText(row, "div", product.units);
      appendText(row, "div", formatMoneyCents(product.totalCostCents));
      appendText(row, "div", "");
      list.appendChild(row);
    });
    wrapper.appendChild(list);
    els.detailWrittenArea.appendChild(wrapper);
  }

  function renderCarousel(expense) {
    const files = expense.files || [];
    const currentFile = files[state.carouselIndex];
    els.detailUploadArea.textContent = "";
    if (!currentFile) return;
    const carousel = document.createElement("div");
    carousel.className = "carousel";
    const view = document.createElement("div");
    view.className = "carousel-view";

    const safeFileUrl = validateExpenseFileUrl(currentFile.fileUrl);
    if (currentFile.fileType === "image" && safeFileUrl) {
      const img = document.createElement("img");
      img.src = safeFileUrl;
      img.alt = currentFile.fileName || "Arquivo da despesa";
      img.onerror = () => {
        img.remove();
        appendText(view, "div", "Imagem indisponivel", "file-box");
      };
      view.appendChild(img);
    } else {
      const box = appendText(view, "div", currentFile.fileType === "pdf" ? "Arquivo PDF" : "Arquivo", "file-box");
      appendText(box, "small", currentFile.fileName || currentFile.name);
      if (safeFileUrl) {
        const link = document.createElement("a");
        link.href = safeFileUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Abrir arquivo";
        box.appendChild(link);
      }
    }

    const controls = document.createElement("div");
    controls.className = "carousel-controls";
    const previous = document.createElement("button");
    previous.textContent = "Back";
    previous.addEventListener("click", () => {
      state.carouselIndex = state.carouselIndex === 0 ? files.length - 1 : state.carouselIndex - 1;
      renderCarousel(expense);
    });
    const counter = appendText(controls, "div", `${state.carouselIndex + 1} de ${files.length}`, "carousel-counter");
    const next = document.createElement("button");
    next.textContent = "Next";
    next.addEventListener("click", () => {
      state.carouselIndex = state.carouselIndex === files.length - 1 ? 0 : state.carouselIndex + 1;
      renderCarousel(expense);
    });
    controls.prepend(previous);
    controls.append(counter, next);
    carousel.append(view, controls);
    els.detailUploadArea.appendChild(carousel);
  }

  function validateExpenseFileUrl(value) {
    if (!value) return null;
    try {
      const url = new URL(String(value), window.location.origin);
      const allowedHost =
        url.origin === window.location.origin ||
        url.hostname.endsWith(".supabase.co") ||
        url.hostname.endsWith(".supabase.in");
      return url.protocol === "https:" && allowedHost ? url.href : null;
    } catch {
      return null;
    }
  }

  function closeDetails() {
    els.detailOverlay.classList.remove("active");
  }

  function bindEvents() {
    els.btnCreateExpense.addEventListener("click", () => els.createOptions.classList.toggle("active"));
    els.btnCreateWritten.addEventListener("click", () => openCreateForm("written"));
    els.btnCreateUpload.addEventListener("click", () => openCreateForm("upload"));
    els.closeFormModal.addEventListener("click", closeForm);
    els.btnCancelForm.addEventListener("click", closeForm);
    els.btnSaveExpense.addEventListener("click", saveExpense);
    els.btnAddProduct.addEventListener("click", addProductToForm);
    els.expenseFiles.addEventListener("change", handleFileUpload);
    els.closeDetailModal.addEventListener("click", closeDetails);
    els.closeDetailModal2.addEventListener("click", closeDetails);
    els.formOverlay.addEventListener("click", (event) => {
      if (event.target === els.formOverlay) closeForm();
    });
    els.detailOverlay.addEventListener("click", (event) => {
      if (event.target === els.detailOverlay) closeDetails();
    });
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".create-wrapper")) {
        els.createOptions.classList.remove("active");
      }
    });
    [els.searchExpense, els.filterDate, els.filterMinValue].forEach((input) => {
      input.addEventListener("input", () => {
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(loadExpenses, 250);
      });
    });
  }

  async function init() {
    bindEvents();
    try {
      const ok = await bootstrapContext();
      if (!ok) return;
      await loadExpenses();
    } catch (error) {
      els.expensesGrid.textContent = "";
      els.emptyMessage.style.display = "block";
      setMessage(error.message, "error");
    }
  }

  init();
})();
