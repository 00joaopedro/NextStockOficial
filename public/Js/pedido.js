(function () {
  if (window.isNextStockDemoMode?.()) return;

  const itemsPerPage = 10;
  let currentPage = 1;
  let currentOrders = [];
  let totalPages = 0;
  let previewMode = false;

  const ordersContainer = document.getElementById("ordersContainer");
  const pagination = document.getElementById("pagination");
  const emptyOrders = document.getElementById("emptyOrders");
  const searchInput = document.getElementById("searchInput");
  const minPriceInput = document.getElementById("minPriceInput");
  const statusFilter = document.getElementById("statusFilter");
  const orderDetailOverlay = document.getElementById("orderDetailOverlay");
  const closeDetailModal = document.getElementById("closeDetailModal");
  const detailTitle = document.getElementById("detailTitle");
  const productsList = document.getElementById("productsList");
  const printArea = document.getElementById("printArea");

  const STATUS_LABELS = {
    pending: "Pendente",
    paid: "Pago",
    preparing: "Em preparo",
    delivered: "Entregue",
    canceled: "Cancelado",
    refunded: "Estornado",
  };

  function getSelectedBranch() {
    try {
      return JSON.parse(
        sessionStorage.getItem("nextstockSelectedBranch") || "null",
      );
    } catch {
      return null;
    }
  }

  function getOperationalStorageKey(baseKey) {
    let branch = null;
    let user = null;
    try {
      branch = JSON.parse(
        sessionStorage.getItem("nextstockSelectedBranch") || "null",
      );
      user = JSON.parse(
        sessionStorage.getItem("nextstockAuthenticatedUser") || "null",
      );
    } catch {
      branch = null;
      user = null;
    }
    return [
      baseKey,
      branch?.tenantId || "no-tenant",
      branch?.id || "no-branch",
      user?.id || "anonymous",
    ].join(":");
  }

  function buildHeaders() {
    const headers = { "Content-Type": "application/json" };
    const branch = getSelectedBranch();
    if (branch?.id) headers["x-nextstock-branch-id"] = branch.id;

    try {
      const supportContext = JSON.parse(
        sessionStorage.getItem("nextstockDevSupportContext") || "null",
      );
      if (supportContext?.branchId && supportContext.branchId === branch?.id) {
        headers["x-nextstock-dev-context"] = "support";
      }
    } catch {
      // Ignore invalid local support context; backend remains the source of truth.
    }

    return headers;
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      credentials: "include",
      ...options,
      headers: {
        ...buildHeaders(),
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Sessão expirada ou inválida. Faça login novamente.");
      }
      throw new Error(data.message || `Erro ${response.status}`);
    }

    return data;
  }

  async function validateContext() {
    const profile = await apiFetch("/auth/profile");
    const context = await apiFetch("/system/context");
    previewMode = String(context.systemMode).toUpperCase() === "PREVIEW";
    window.setNextStockBackendContext?.(context);
    if (profile.user) {
      sessionStorage.setItem(
        "nextstockAuthenticatedUser",
        JSON.stringify(profile.user),
      );
    }
    if (context.selectedBranch) {
      sessionStorage.setItem(
        "nextstockSelectedBranch",
        JSON.stringify(context.selectedBranch),
      );
    }

    if (!context.selectedBranch?.id) {
      throw new Error("Selecione uma filial valida para acessar pedidos.");
    }
  }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function formatDateTime(value) {
    if (!value) return "-";
    return new Date(value).toLocaleString("pt-BR");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mapStatusFilter(value) {
    if (value === "entregue") return "delivered";
    if (value === "pendente") return "pending";
    return "";
  }

  function showMessage(message) {
    ordersContainer.innerHTML = "";
    emptyOrders.style.display = "block";
    emptyOrders.textContent = message;
    pagination.innerHTML = "";
  }

  async function loadOrders() {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();
    const minTotal = Number(minPriceInput.value || 0);
    const status = mapStatusFilter(statusFilter.value);

    params.set("page", String(currentPage));
    params.set("pageSize", String(itemsPerPage));
    if (search) params.set("search", search);
    if (minTotal > 0) params.set("minTotal", String(minTotal));
    if (status) params.set("status", status);

    showMessage("Carregando pedidos...");
    const data = await apiFetch(`/orders?${params.toString()}`);
    currentOrders = data.items || [];
    totalPages = data.totalPages || 0;
    renderOrders();
  }

  function renderOrders() {
    ordersContainer.innerHTML = "";

    if (!currentOrders.length) {
      showMessage("Nenhum pedido encontrado com os filtros informados.");
      return;
    }

    emptyOrders.style.display = "none";

    currentOrders.forEach((order) => {
      const isDelivered = order.status === "delivered";
      const isCanceled = order.status === "canceled";
      const created = new Date(order.createdAt);
      const card = document.createElement("div");
      card.className = "order-card";

      card.innerHTML = `
        <div class="order-info">
          <div class="info-box">
            <span>Nome do comprador</span>
            <strong>${escapeHtml(order.customerName)}</strong>
          </div>
          <div class="info-box">
            <span>Formato de pagamento</span>
            <strong>${escapeHtml(formatPayment(order.paymentMethod))}</strong>
          </div>
          <div class="info-box">
            <span>Data do pedido</span>
            <strong>${created.toLocaleDateString("pt-BR")}</strong>
          </div>
          <div class="info-box">
            <span>Hora que o pedido foi feito</span>
            <strong>${created.toLocaleTimeString("pt-BR")}</strong>
          </div>
          <div class="info-box">
            <span>Status</span>
            <strong class="${isDelivered ? "status-entregue" : "status-pendente"}">
              ${escapeHtml(STATUS_LABELS[order.status] || order.status)}
            </strong>
          </div>
        </div>
        <div class="card-actions">
          <button class="btn success" data-action="delivered" ${previewMode || isDelivered || isCanceled ? "disabled" : ""}>
            ${isDelivered ? "Pedido entregue" : "Marcar como entregue"}
          </button>
          <button class="btn cancel" data-action="cancel" ${previewMode || isCanceled ? "disabled" : ""}>Cancelar pedido</button>
          <button class="btn success" data-action="print">Imprimir recibo</button>
          <button class="btn info" data-action="nfe">NF-e</button>
        </div>
      `;

      card.addEventListener("click", () => openOrderDetails(order.id));
      card
        .querySelector('[data-action="delivered"]')
        .addEventListener("click", (event) => {
          event.stopPropagation();
          markAsDelivered(order.id);
        });
      card
        .querySelector('[data-action="cancel"]')
        .addEventListener("click", (event) => {
          event.stopPropagation();
          cancelOrder(order.id);
        });
      card
        .querySelector('[data-action="print"]')
        .addEventListener("click", (event) => {
          event.stopPropagation();
          printReceipt(order.id);
        });
      card
        .querySelector('[data-action="nfe"]')
        .addEventListener("click", (event) => {
          event.stopPropagation();
          sendToNfe(order.id);
        });

      ordersContainer.appendChild(card);
    });

    renderPagination();
  }

  function renderPagination() {
    pagination.innerHTML = "";
    if (totalPages <= 1) return;

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "Anterior";
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage -= 1;
        loadOrders();
      }
    });
    pagination.appendChild(prevBtn);

    for (let page = 1; page <= totalPages; page += 1) {
      const btn = document.createElement("button");
      btn.textContent = String(page);
      btn.classList.toggle("active", page === currentPage);
      btn.addEventListener("click", () => {
        currentPage = page;
        loadOrders();
      });
      pagination.appendChild(btn);
    }
  }

  async function openOrderDetails(orderId) {
    const data = await apiFetch(`/orders/${orderId}`);
    const order = data.order;
    detailTitle.textContent = `Produtos do pedido - ${order.customerName}`;
    productsList.innerHTML = order.items
      .map(
        (item) => `
      <div class="product-row">
        <div><strong>${escapeHtml(item.name)}</strong></div>
        <div>${item.quantity}</div>
        <div>${formatMoney(item.totalPrice)}</div>
      </div>
    `,
      )
      .join("");
    orderDetailOverlay.classList.add("active");
  }

  async function markAsDelivered(orderId) {
    await apiFetch(`/orders/${orderId}/deliver`, { method: "PATCH" });
    await loadOrders();
  }

  async function cancelOrder(orderId) {
    const confirmCancel = confirm("Deseja cancelar este pedido?");
    if (!confirmCancel) return;
    const cancellationReason =
      prompt("Motivo do cancelamento (opcional):") || "";
    await apiFetch(`/orders/${orderId}/cancel`, {
      method: "PATCH",
      body: JSON.stringify({ cancellationReason }),
    });
    await loadOrders();
  }

  async function printReceipt(orderId) {
    const data = await apiFetch(`/orders/${orderId}/receipt`);
    if (data.html) {
      const frame = document.createElement("iframe");
      frame.hidden = true;
      document.body.appendChild(frame);
      frame.contentDocument.open();
      frame.contentDocument.write(data.html);
      frame.contentDocument.close();
      window.setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        window.setTimeout(() => frame.remove(), 1000);
      }, 50);
      return;
    }
    const order = data.receipt.order;
    const rows = order.items
      .map(
        (item) => `
      <tr>
        <td>${escapeHtml(item.name)}</td>
        <td>${item.quantity}</td>
        <td>${formatMoney(item.totalPrice)}</td>
      </tr>
    `,
      )
      .join("");

    printArea.innerHTML = `
      <div>
        <h2>NextStock - Recibo do Pedido</h2>
        <p><strong>Comprador:</strong> ${escapeHtml(order.customerName)}</p>
        <p><strong>Pagamento:</strong> ${escapeHtml(formatPayment(order.paymentMethod))}</p>
        <p><strong>Data:</strong> ${formatDateTime(order.createdAt)}</p>
        <p><strong>Status:</strong> ${escapeHtml(STATUS_LABELS[order.status] || order.status)}</p>
        <hr>
        <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="8">
          <thead>
            <tr>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Preço total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <hr>
        <p><strong>Total:</strong> ${formatMoney(order.total)}</p>
      </div>
    `;
    printArea.style.display = "block";
    window.print();
    printArea.style.display = "none";
  }

  function sendToNfe(orderId) {
    sessionStorage.setItem(
      getOperationalStorageKey("nextstockPedidoParaNfe"),
      JSON.stringify({ orderId }),
    );
    window.location.href = `ntfe.html?orderId=${encodeURIComponent(orderId)}`;
  }

  function closeOrderDetails() {
    orderDetailOverlay.classList.remove("active");
  }

  function formatPayment(value) {
    return (
      {
        pix: "PIX",
        credit_card: "Cartão de crédito",
        debit_card: "Cartão de débito",
        cash: "Dinheiro",
        other: "Outro",
      }[value] ||
      value ||
      "Outro"
    );
  }

  function resetAndLoad() {
    currentPage = 1;
    loadOrders().catch((error) =>
      showMessage(error.message || "Não foi possível carregar pedidos."),
    );
  }

  searchInput.addEventListener("input", resetAndLoad);
  minPriceInput.addEventListener("input", resetAndLoad);
  statusFilter.addEventListener("change", resetAndLoad);
  closeDetailModal.addEventListener("click", closeOrderDetails);
  orderDetailOverlay.addEventListener("click", (event) => {
    if (event.target === orderDetailOverlay) closeOrderDetails();
  });

  validateContext()
    .then(loadOrders)
    .catch((error) =>
      showMessage(error.message || "Não foi possível validar a sessão."),
    );
})();
