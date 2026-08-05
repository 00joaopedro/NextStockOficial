    if (window.isNextStockDemoMode?.()) {
    function getOperationalStorageKey(baseKey) {
      let branch = null;
      let user = null;
      try {
        branch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
        user = JSON.parse(sessionStorage.getItem("nextstockAuthenticatedUser") || "null");
      } catch {
        branch = null;
        user = null;
      }
      return [
        baseKey,
        branch?.tenantId || "no-tenant",
        branch?.id || "no-branch",
        user?.id || "anonymous"
      ].join(":");
    }

    const DEMO_ORDERS = [
      {
        id: 1,
        buyer: "Ana Paula Ribeiro",
        payment: "PIX",
        date: "2026-04-21",
        dateFormatted: "21/04/2026",
        time: "09:15:22",
        delivered: false,
        products: [
          { name: "Copo Térmico", qty: 2, total: 99.80 },
          { name: "Escorredor de Silicone", qty: 1, total: 34.90 },
          { name: "Organizador de Geladeira", qty: 1, total: 59.90 }
        ]
      },
      {
        id: 2,
        buyer: "Carlos Henrique Souza",
        payment: "Cartão de crédito",
        date: "2026-04-21",
        dateFormatted: "21/04/2026",
        time: "10:34:08",
        delivered: false,
        products: [
          { name: "Garrafa Inox", qty: 1, total: 79.90 },
          { name: "Kit Talheres", qty: 1, total: 89.90 }
        ]
      },
      {
        id: 3,
        buyer: "Mariana Costa",
        payment: "Dinheiro",
        date: "2026-04-22",
        dateFormatted: "22/04/2026",
        time: "13:20:41",
        delivered: false,
        products: [
          { name: "Pote Hermético", qty: 4, total: 119.60 },
          { name: "Suporte Multiuso", qty: 2, total: 45.80 }
        ]
      },
      {
        id: 4,
        buyer: "Roberto Lima",
        payment: "Cartão de débito",
        date: "2026-04-22",
        dateFormatted: "22/04/2026",
        time: "15:02:10",
        delivered: false,
        products: [
          { name: "Lixeira Automática", qty: 1, total: 149.90 },
          { name: "Tapete Antiderrapante", qty: 2, total: 79.80 }
        ]
      },
      {
        id: 5,
        buyer: "Juliana Mendes",
        payment: "PIX",
        date: "2026-04-23",
        dateFormatted: "23/04/2026",
        time: "08:48:55",
        delivered: false,
        products: [
          { name: "Caixa Organizadora", qty: 3, total: 194.70 },
          { name: "Organizador de Cabos", qty: 5, total: 99.50 }
        ]
      },
      {
        id: 6,
        buyer: "Lucas Almeida",
        payment: "Cartão de crédito",
        date: "2026-04-23",
        dateFormatted: "23/04/2026",
        time: "11:12:36",
        delivered: false,
        products: [
          { name: "Filtro de Água", qty: 1, total: 119.90 },
          { name: "Balança Digital", qty: 2, total: 109.80 }
        ]
      },
      {
        id: 7,
        buyer: "Fernanda Rocha",
        payment: "PIX",
        date: "2026-04-24",
        dateFormatted: "24/04/2026",
        time: "14:09:19",
        delivered: false,
        products: [
          { name: "Panela Antiaderente", qty: 1, total: 99.90 },
          { name: "Copo Térmico", qty: 1, total: 49.90 }
        ]
      },
      {
        id: 8,
        buyer: "Patrícia Gomes",
        payment: "Dinheiro",
        date: "2026-04-24",
        dateFormatted: "24/04/2026",
        time: "16:45:03",
        delivered: false,
        products: [
          { name: "Escorredor de Silicone", qty: 2, total: 69.80 },
          { name: "Organizador de Geladeira", qty: 2, total: 119.80 }
        ]
      },
      {
        id: 9,
        buyer: "Rafael Martins",
        payment: "Cartão de débito",
        date: "2026-04-25",
        dateFormatted: "25/04/2026",
        time: "09:03:17",
        delivered: false,
        products: [
          { name: "Garrafa Inox", qty: 2, total: 159.80 },
          { name: "Suporte Multiuso", qty: 3, total: 68.70 }
        ]
      },
      {
        id: 10,
        buyer: "Beatriz Nunes",
        payment: "PIX",
        date: "2026-04-25",
        dateFormatted: "25/04/2026",
        time: "12:30:59",
        delivered: false,
        products: [
          { name: "Kit Talheres", qty: 1, total: 89.90 },
          { name: "Pote Hermético", qty: 2, total: 59.80 }
        ]
      },
      {
        id: 11,
        buyer: "Eduardo Silva",
        payment: "Cartão de crédito",
        date: "2026-04-26",
        dateFormatted: "26/04/2026",
        time: "17:25:44",
        delivered: false,
        products: [
          { name: "Lixeira Automática", qty: 1, total: 149.90 },
          { name: "Filtro de Água", qty: 1, total: 119.90 }
        ]
      }
    ];
    const orders = window.isNextStockDemoMode?.() ? DEMO_ORDERS : [];

    const itemsPerPage = 10;
    let currentPage = 1;
    let filteredOrders = [...orders];

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

    function formatMoney(value) {
      return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function getOrderTotal(order) {
      return order.products.reduce((acc, product) => acc + product.total, 0);
    }

    function filterOrders() {
      const search = searchInput.value.trim().toLowerCase();
      const minValue = parseFloat(minPriceInput.value) || 0;
      const status = statusFilter.value;

      filteredOrders = orders.filter(order => {
        const matchName = order.buyer.toLowerCase().includes(search);
        const matchValue = getOrderTotal(order) >= minValue;
        const matchStatus =
          status === "todos" ||
          (status === "entregue" && order.delivered) ||
          (status === "pendente" && !order.delivered);

        return matchName && matchValue && matchStatus;
      });

      currentPage = 1;
      renderOrders();
    }

    function renderOrders() {
      ordersContainer.innerHTML = "";

      if (!filteredOrders.length) {
        emptyOrders.style.display = "block";
        pagination.innerHTML = "";
        return;
      }

      emptyOrders.style.display = "none";

      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const pageItems = filteredOrders.slice(start, end);

      pageItems.forEach(order => {
        const card = document.createElement("div");
        card.className = "order-card";

        card.innerHTML = `
          <div class="order-info">
            <div class="info-box">
              <span>Nome do comprador</span>
              <strong>${order.buyer}</strong>
            </div>

            <div class="info-box">
              <span>Formato de pagamento</span>
              <strong>${order.payment}</strong>
            </div>

            <div class="info-box">
              <span>Data do pedido</span>
              <strong>${order.dateFormatted}</strong>
            </div>

            <div class="info-box">
              <span>Hora que o pedido foi feito</span>
              <strong>${order.time}</strong>
            </div>

            <div class="info-box">
              <span>Status</span>
              <strong class="${order.delivered ? "status-entregue" : "status-pendente"}">
                ${order.delivered ? "Entregue" : "Não entregue"}
              </strong>
            </div>
          </div>

          <div class="card-actions">
            <button class="btn success" data-action="delivered" ${order.delivered ? "disabled" : ""}>
              ${order.delivered ? "Pedido entregue" : "Marcar como entregue"}
            </button>
            <button class="btn cancel" data-action="cancel">Cancelar pedido</button>
            <button class="btn success" data-action="print">Imprimir recibo</button>
            <button class="btn info" data-action="nfe">NF-e</button>
          </div>
        `;

        card.addEventListener("click", () => openOrderDetails(order.id));

        card.querySelector('[data-action="delivered"]').addEventListener("click", event => {
          event.stopPropagation();
          markAsDelivered(order.id);
        });

        card.querySelector('[data-action="cancel"]').addEventListener("click", event => {
          event.stopPropagation();
          cancelOrder(order.id);
        });

        card.querySelector('[data-action="print"]').addEventListener("click", event => {
          event.stopPropagation();
          printReceipt(order.id);
        });

        card.querySelector('[data-action="nfe"]').addEventListener("click", event => {
          event.stopPropagation();
          sendToNfe(order.id);
        });

        ordersContainer.appendChild(card);
      });

      renderPagination();
    }

    function renderPagination() {
      const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
      pagination.innerHTML = "";

      if (totalPages <= 1) return;

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "Anterior";
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          renderOrders();
        }
      });

      pagination.appendChild(prevBtn);

      for (let page = 1; page <= totalPages; page++) {
        const btn = document.createElement("button");
        btn.textContent = page;
        btn.classList.toggle("active", page === currentPage);

        btn.addEventListener("click", () => {
          currentPage = page;
          renderOrders();
        });

        pagination.appendChild(btn);
      }

      const nextBtn = document.createElement("button");
      nextBtn.textContent = "Próxima";
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderOrders();
        }
      });

      pagination.appendChild(nextBtn);
    }

    function openOrderDetails(orderId) {
      const order = orders.find(item => item.id === orderId);
      if (!order) return;

      detailTitle.textContent = `Produtos do pedido - ${order.buyer}`;

      productsList.innerHTML = order.products.map(product => `
        <div class="product-row">
          <div><strong>${product.name}</strong></div>
          <div>${product.qty}</div>
          <div>${formatMoney(product.total)}</div>
        </div>
      `).join("");

      orderDetailOverlay.classList.add("active");
    }

    function closeOrderDetails() {
      orderDetailOverlay.classList.remove("active");
    }

    function markAsDelivered(orderId) {
      const order = orders.find(item => item.id === orderId);
      if (!order) return;

      order.delivered = true;
      filterOrders();
    }

    function cancelOrder(orderId) {
      const confirmCancel = confirm("Deseja cancelar este pedido?");
      if (!confirmCancel) return;

      const index = orders.findIndex(item => item.id === orderId);
      if (index !== -1) {
        orders.splice(index, 1);
      }

      filterOrders();
    }

    function printReceipt(orderId) {
      const order = orders.find(item => item.id === orderId);
      if (!order) return;

      const rows = order.products.map(product => `
        <tr>
          <td>${product.name}</td>
          <td>${product.qty}</td>
          <td>${formatMoney(product.total)}</td>
        </tr>
      `).join("");

      printArea.innerHTML = `
        <div>
          <h2>NextStock - Recibo do Pedido</h2>
          <p><strong>Comprador:</strong> ${order.buyer}</p>
          <p><strong>Pagamento:</strong> ${order.payment}</p>
          <p><strong>Data:</strong> ${order.dateFormatted}</p>
          <p><strong>Hora:</strong> ${order.time}</p>
          <p><strong>Status:</strong> ${order.delivered ? "Entregue" : "Não entregue"}</p>

          <hr>

          <table style="width:100%; border-collapse:collapse;" border="1" cellpadding="8">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Quantidade</th>
                <th>Preço total</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <hr>

          <p><strong>Total:</strong> ${formatMoney(getOrderTotal(order))}</p>
        </div>
      `;

      printArea.style.display = "block";
      window.print();
      printArea.style.display = "none";
    }

    function sendToNfe(orderId) {
      const order = orders.find(item => item.id === orderId);
      if (!order) return;

      sessionStorage.setItem(
        getOperationalStorageKey("nextstockPedidoParaNfe"),
        JSON.stringify(order)
      );
      window.location.href = "ntfe.html";
    }

    searchInput.addEventListener("input", filterOrders);
    minPriceInput.addEventListener("input", filterOrders);
    statusFilter.addEventListener("change", filterOrders);

    closeDetailModal.addEventListener("click", closeOrderDetails);

    orderDetailOverlay.addEventListener("click", event => {
      if (event.target === orderDetailOverlay) {
        closeOrderDetails();
      }
    });

    renderOrders();
    }
  
