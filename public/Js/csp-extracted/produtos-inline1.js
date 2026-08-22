    function isDemoMode() {
      const params = new URLSearchParams(window.location.search);
      const previewRequested = sessionStorage.getItem("nextstockIsPreview") === "true" ||
        sessionStorage.getItem("nextstockPreviewMode") === "true" ||
        params.get("mode") === "preview" ||
        params.get("mode") === "visualizacao";
      return previewRequested &&
        !sessionStorage.getItem("nextstockAuthenticatedUser");
    }

    const DEMO_PRODUCTS = [
      {
        id: 1,
        name: "Copo Térmico",
        price: 49.90,
        code: "P001",
        category: "Utilidades",
        stock: 40,
        description: "Copo térmico resistente para manter bebidas geladas ou quentes.",
        images: [
          "img/techstore.jpg",
          "https://via.placeholder.com/600x400/00cfcf/0d1b2a?text=Copo+Termico+1",
          "https://via.placeholder.com/600x400/071b31/ffffff?text=Copo+Termico+2"
        ]
      },
      {
        id: 2,
        name: "Escorredor de Silicone",
        price: 34.90,
        code: "P002",
        category: "Cozinha",
        stock: 25,
        description: "Escorredor dobrável de silicone para pia e bancada.",
        images: [
          "img/techstore.jpg",
          "https://via.placeholder.com/600x400/00b4d8/ffffff?text=Escorredor+2"
        ]
      },
      {
        id: 3,
        name: "Organizador de Geladeira",
        price: 59.90,
        code: "P003",
        category: "Organização",
        stock: 18,
        description: "Organizador transparente para facilitar o armazenamento na geladeira.",
        images: ["img/techstore.jpg"]
      },
      {
        id: 4,
        name: "Pote Hermético",
        price: 29.90,
        code: "P004",
        category: "Cozinha",
        stock: 60,
        description: "Pote com vedação para conservar alimentos.",
        images: ["https://via.placeholder.com/600x400/ffffff/0d1b2a?text=Pote+Hermetico"]
      },
      {
        id: 5,
        name: "Garrafa Inox",
        price: 79.90,
        code: "P005",
        category: "Utilidades",
        stock: 32,
        description: "Garrafa inox com isolamento térmico.",
        images: [
          "https://via.placeholder.com/600x400/00cfcf/0d1b2a?text=Garrafa+1",
          "https://via.placeholder.com/600x400/071b31/ffffff?text=Garrafa+2"
        ]
      },
      {
        id: 6,
        name: "Suporte Multiuso",
        price: 22.90,
        code: "P006",
        category: "Organização",
        stock: 45,
        description: "Suporte multiuso para cozinha, banheiro ou área de serviço.",
        images: ["https://via.placeholder.com/600x400/eeeeee/23384d?text=Suporte"]
      },
      {
        id: 7,
        name: "Lixeira Automática",
        price: 149.90,
        code: "P007",
        category: "Casa",
        stock: 12,
        description: "Lixeira com sensor automático de abertura.",
        images: [
          "https://via.placeholder.com/600x400/ffb546/0d1b2a?text=Lixeira+1",
          "https://via.placeholder.com/600x400/00cfcf/0d1b2a?text=Lixeira+2"
        ]
      },
      {
        id: 8,
        name: "Kit Talheres",
        price: 89.90,
        code: "P008",
        category: "Cozinha",
        stock: 20,
        description: "Kit completo de talheres em aço inox.",
        images: ["https://via.placeholder.com/600x400/f5fbfc/23384d?text=Talheres"]
      },
      {
        id: 9,
        name: "Tapete Antiderrapante",
        price: 39.90,
        code: "P009",
        category: "Casa",
        stock: 50,
        description: "Tapete antiderrapante para banheiro ou cozinha.",
        images: ["https://via.placeholder.com/600x400/00b4d8/ffffff?text=Tapete"]
      },
      {
        id: 10,
        name: "Caixa Organizadora",
        price: 64.90,
        code: "P010",
        category: "Organização",
        stock: 28,
        description: "Caixa organizadora resistente com tampa.",
        images: [
          "https://via.placeholder.com/600x400/071b31/ffffff?text=Caixa+1",
          "https://via.placeholder.com/600x400/00cfcf/0d1b2a?text=Caixa+2"
        ]
      },
      {
        id: 11,
        name: "Filtro de Água",
        price: 119.90,
        code: "P011",
        category: "Casa",
        stock: 10,
        description: "Filtro de água compacto para uso doméstico.",
        images: ["https://via.placeholder.com/600x400/ffffff/23384d?text=Filtro"]
      },
      {
        id: 12,
        name: "Balança Digital",
        price: 54.90,
        code: "P012",
        category: "Cozinha",
        stock: 22,
        description: "Balança digital para cozinha com medição precisa.",
        images: ["https://via.placeholder.com/600x400/00cfcf/0d1b2a?text=Balanca"]
      },
      {
        id: 13,
        name: "Panela Antiaderente",
        price: 99.90,
        code: "P013",
        category: "Cozinha",
        stock: 15,
        description: "Panela antiaderente de alta durabilidade.",
        images: ["https://via.placeholder.com/600x400/ffb546/0d1b2a?text=Panela"]
      },
      {
        id: 14,
        name: "Organizador de Cabos",
        price: 19.90,
        code: "P014",
        category: "Organização",
        stock: 80,
        description: "Organizador para cabos e pequenos acessórios.",
        images: ["https://via.placeholder.com/600x400/eeeeee/23384d?text=Cabos"]
      }
    ];
    let products = isDemoMode() ? DEMO_PRODUCTS : [];

    const itemsPerPage = 12;
    const maxClientOrders = 3;

    let currentPage = 1;
    let cartActive = false;
    let clientName = "";
    let clientEmail = "";
    let clientData = null;
    let cart = {};
    let selectedProduct = null;
    let carouselIndex = 0;
    let clientOrders = [];
    let productsLoadError = "";
    let productsTotal = products.length;
    let productsTotalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
    let productsRequestController = null;
    let productsSearchTimer = null;

    const sidebarToggle = document.getElementById("sidebarToggle");
    const sidebar = document.getElementById("sidebar");

    const cartBtn = document.getElementById("cart-btn");
    const ordersBtn = document.getElementById("orders-btn");
    const ordersCount = document.getElementById("orders-count");
    const cartList = document.getElementById("cart-list");
    const clientOrdersList = document.getElementById("client-orders-list");
    const cartCount = document.getElementById("cart-count");
    const productContainer = document.getElementById("product-container");
    const pagination = document.getElementById("pagination");
    const searchInput = document.getElementById("searchInput");
    const minPriceInput = document.getElementById("minPriceInput");

    const orderOverlay = document.getElementById("orderOverlay");
    const startOrderYes = document.getElementById("startOrderYes");
    const startOrderNo = document.getElementById("startOrderNo");
    const clientNameBox = document.getElementById("clientNameBox");
    const clientEmailInput = document.getElementById("clientEmailInput");
    const clientFullNameInput = document.getElementById("clientFullNameInput");
    const clientPhoneInput = document.getElementById("clientPhoneInput");
    const clientCepInput = document.getElementById("clientCepInput");
    const clientStateInput = document.getElementById("clientStateInput");
    const clientCityInput = document.getElementById("clientCityInput");
    const clientNeighborhoodInput = document.getElementById("clientNeighborhoodInput");
    const clientHouseNumberInput = document.getElementById("clientHouseNumberInput");
    const clientStreetInput = document.getElementById("clientStreetInput");
    const clientComplementInput = document.getElementById("clientComplementInput");
    const confirmClientName = document.getElementById("confirmClientName");
    const cancelClientDataBtn = document.getElementById("cancelClientDataBtn");

    const productDetailOverlay = document.getElementById("productDetailOverlay");
    const closeDetailModal = document.getElementById("closeDetailModal");
    const detailTitle = document.getElementById("detailTitle");
    const detailName = document.getElementById("detailName");
    const detailPrice = document.getElementById("detailPrice");
    const detailCode = document.getElementById("detailCode");
    const detailCategory = document.getElementById("detailCategory");
    const detailStock = document.getElementById("detailStock");
    const detailDescription = document.getElementById("detailDescription");
    const detailAddToCart = document.getElementById("detailAddToCart");
    const carouselView = document.getElementById("carouselView");
    const carouselCounter = document.getElementById("carouselCounter");
    const prevImageBtn = document.getElementById("prevImageBtn");
    const nextImageBtn = document.getElementById("nextImageBtn");

    const clientOrderDetailOverlay = document.getElementById("clientOrderDetailOverlay");
    const closeClientOrderDetail = document.getElementById("closeClientOrderDetail");
    const orderDetailTotal = document.getElementById("orderDetailTotal");
    const orderDetailDate = document.getElementById("orderDetailDate");
    const orderDetailProducts = document.getElementById("orderDetailProducts");

    function shouldUseProductionBackend() {
      const params = new URLSearchParams(window.location.search);
      return sessionStorage.getItem("nextstockBackendMode") === "production" ||
        params.get("mode") === "production";
    }

    function safeImageUrl(value) {
      const raw = String(value || "").trim();
      if (/^img\/[A-Za-z0-9._/-]+$/.test(raw)) return raw;
      try {
        const url = new URL(raw, window.location.origin);
        const allowedHost =
          url.origin === window.location.origin ||
          url.hostname.endsWith(".supabase.co") ||
          url.hostname.endsWith(".supabase.in");
        return url.protocol === "https:" && allowedHost ? url.href : null;
      } catch {
        return null;
      }
    }

    function isRenderableImageUrl(value) {
      return Boolean(safeImageUrl(value));
    }

    function createSafeImage(value, alt) {
      const image = document.createElement("img");
      image.src = safeImageUrl(value) || productImageFallback();
      image.alt = String(alt || "Produto");
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        image.src = productImageFallback();
      }, { once: true });
      return image;
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function productImageFallback() {
      return "img/techstore.jpg";
    }

    function mapApiProduct(product) {
      const imageMetadata = product.imageMetadata || [];
      const apiImages = imageMetadata
        .map((image) => image.fileUrl || image.signedUrl || image.url)
        .filter(isRenderableImageUrl);
      const fallbackImages = (product.imagens || []).filter(isRenderableImageUrl);

      return {
        id: product.id,
        name: product.nome || product.name || "Produto",
        price: Number(product.precoVenda || product.price || 0),
        code: product.sku || product.codigoBarra || product.code || "-",
        category: product.categoria || product.category || "Sem categoria",
        stock: Number(product.quantidade || product.stock || 0),
        description: product.descricao || product.description || "",
        images: apiImages.length > 0
          ? apiImages
          : fallbackImages.length > 0
            ? fallbackImages
            : [productImageFallback()]
      };
    }

    async function loadProductsFromBackend() {
      if (!shouldUseProductionBackend()) return;

      try {
        productsRequestController?.abort();
        productsRequestController = new AbortController();
        let selectedBranch = null;
        try {
          selectedBranch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
        } catch {
          selectedBranch = null;
        }

        const params = new URLSearchParams({
          page: String(currentPage),
          limit: String(itemsPerPage)
        });
        const search = searchInput.value.trim();
        if (search) params.set("search", search);
        const response = await fetch(`/api/products?${params}`, {
          credentials: "include",
          signal: productsRequestController.signal,
          headers: selectedBranch?.id
            ? { "x-nextstock-branch-id": selectedBranch.id }
            : {}
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.message || "Nao foi possivel carregar produtos.");
        }

        if (data.mode !== "visualizacao") {
          products = (data.products || []).map(mapApiProduct);
          productsTotal = Number(data.total || 0);
          productsTotalPages = Math.max(1, Number(data.totalPages || 1));
          productsLoadError = "";
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        products = [];
        productsLoadError = error.message || "Nao foi possivel carregar produtos.";
      }
    }

    function formatMoney(value) {
      return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function formatDateTime(value) {
      return new Date(value).toLocaleString("pt-BR");
    }

    function onlyNumbers(value) {
      return String(value || "").replace(/\D/g, "");
    }

    function getClientOrdersKey() {
      let branch = null;
      let user = null;
      try {
        branch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
        user = JSON.parse(sessionStorage.getItem("nextstockAuthenticatedUser") || "null");
      } catch {
        branch = null;
        user = null;
      }
      const tenantKey = branch?.tenantId || "no-tenant";
      const branchKey = branch?.id || "no-branch";
      const userKey = user?.id || clientEmail || "anonymous";
      return `nextstockPedidosCliente:${tenantKey}:${branchKey}:${userKey}:${clientEmail}`;
    }

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

    function loadClientOrders() {
      if (!clientEmail) {
        clientOrders = [];
        return;
      }

      if (shouldUseProductionBackend()) {
        clientOrders = [];
        return;
      }

      try {
        const saved = localStorage.getItem(getClientOrdersKey());
        clientOrders = saved ? JSON.parse(saved) : [];
      } catch {
        clientOrders = [];
      }
    }

    function saveClientOrders() {
      if (!clientEmail) return;
      if (shouldUseProductionBackend()) return;
      localStorage.setItem(getClientOrdersKey(), JSON.stringify(clientOrders));
    }

    function buildApiHeaders() {
      let selectedBranch = null;
      try {
        selectedBranch = JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
      } catch {
        selectedBranch = null;
      }

      const headers = { "Content-Type": "application/json" };
      if (selectedBranch?.id) headers["x-nextstock-branch-id"] = selectedBranch.id;

      try {
        const supportContext = JSON.parse(sessionStorage.getItem("nextstockDevSupportContext") || "null");
        if (supportContext?.branchId && supportContext.branchId === selectedBranch?.id) {
          headers["x-nextstock-dev-context"] = "support";
        }
      } catch {
        // Backend validates the context.
      }

      return headers;
    }

    async function ordersApiFetch(path, options = {}) {
      const response = await fetch(`/api${path}`, {
        credentials: "include",
        ...options,
        headers: {
          ...buildApiHeaders(),
          ...(options.headers || {})
        }
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || `Erro ${response.status}`);
      }

      return data;
    }

    function mapOrderFromApi(order) {
      return {
        id: order.id,
        customerEmail: order.customerEmail,
        customerData: {
          ...(clientData || {}),
          fullName: order.customerName,
          email: order.customerEmail,
          phone: order.customerPhone
        },
        items: (order.items || []).map(item => ({
          productId: item.productId,
          name: item.name || item.productNameSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice
        })),
        total: order.total,
        createdAt: order.createdAt,
        source: "api",
        status: order.status
      };
    }

    async function loadClientOrdersFromBackend() {
      if (!shouldUseProductionBackend() || !clientEmail) return;
      try {
        const params = new URLSearchParams({
          search: clientEmail,
          page: "1",
          pageSize: String(maxClientOrders)
        });
        const data = await ordersApiFetch(`/orders?${params.toString()}`);
        clientOrders = (data.items || []).map(mapOrderFromApi);
      } catch (error) {
        clientOrders = [];
        alert(error.message || "Nao foi possivel carregar pedidos do cliente.");
      }
    }

    function syncOrderControls() {
      ordersCount.textContent = clientOrders.length;
      ordersBtn.disabled = !clientEmail;
      cartBtn.disabled = !cartActive || clientOrders.length >= maxClientOrders;

      if (clientOrders.length >= maxClientOrders) {
        cartList.classList.remove("active");
      }
    }

    function getFilteredProducts() {
      const search = searchInput.value.trim().toLowerCase();
      const minPrice = parseFloat(minPriceInput.value) || 0;

      return products.filter(product => {
        const matchSearch =
          product.name.toLowerCase().includes(search) ||
          product.code.toLowerCase().includes(search) ||
          product.category.toLowerCase().includes(search);

        const matchPrice = product.price >= minPrice;

        return matchSearch && matchPrice;
      });
    }

    function renderProducts() {
      const filtered = getFilteredProducts();
      productContainer.innerHTML = "";

      if (productsLoadError) {
        const message = document.createElement("div");
        message.className = "empty-products";
        message.textContent = productsLoadError;
        productContainer.appendChild(message);
        pagination.innerHTML = "";
        return;
      }

      if (!filtered.length) {
        productContainer.innerHTML = `
          <div class="empty-products">
            Nenhum produto encontrado com os filtros informados.
          </div>
        `;
        pagination.innerHTML = "";
        return;
      }

      const serverPaginated = shouldUseProductionBackend();
      const totalPages = serverPaginated
        ? productsTotalPages
        : Math.ceil(filtered.length / itemsPerPage);

      if (currentPage > totalPages) {
        currentPage = 1;
      }

      const start = serverPaginated ? 0 : (currentPage - 1) * itemsPerPage;
      const end = serverPaginated ? filtered.length : start + itemsPerPage;
      const pageItems = filtered.slice(start, end);

      pageItems.forEach(product => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.dataset.id = product.id;

        card.dataset.id = String(product.id || "");
        card.appendChild(createSafeImage(product.images[0], product.name));
        const title = document.createElement("h3");
        title.textContent = String(product.name || "Produto");
        card.appendChild(title);
        const price = document.createElement("p");
        price.textContent = formatMoney(product.price);
        card.appendChild(price);
        const summary = document.createElement("small");
        summary.textContent = `${String(product.category || "Sem categoria")} • Estoque: ${Number(product.stock) || 0}`;
        card.appendChild(summary);
        const buttons = document.createElement("div");
        buttons.className = "buttons";
        const addButton = document.createElement("button");
        addButton.type = "button";
        addButton.className = "btn add";
        addButton.dataset.action = "add-cart";
        addButton.textContent = "Adicionar ao carrinho";
        buttons.appendChild(addButton);
        card.appendChild(buttons);

        card.addEventListener("click", () => {
          openProductDetails(product.id);
        });

        addButton.addEventListener("click", (event) => {
          event.stopPropagation();
          addToCart(product.id);
        });

        productContainer.appendChild(card);
      });

      renderPagination(serverPaginated ? productsTotal : filtered.length);
    }

    function renderPagination(totalItems) {
      const serverPaginated = shouldUseProductionBackend();
      const totalPages = serverPaginated
        ? productsTotalPages
        : Math.ceil(totalItems / itemsPerPage);
      pagination.innerHTML = "";

      if (totalPages <= 1) return;

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "Anterior";
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener("click", async () => {
        if (currentPage > 1) {
          currentPage--;
          if (serverPaginated) await loadProductsFromBackend();
          renderProducts();
        }
      });

      pagination.appendChild(prevBtn);

      const visiblePages = new Set([1, totalPages]);
      for (
        let page = Math.max(1, currentPage - 2);
        page <= Math.min(totalPages, currentPage + 2);
        page++
      ) {
        visiblePages.add(page);
      }
      let previousPage = 0;
      for (const page of [...visiblePages].sort((a, b) => a - b)) {
        if (previousPage && page - previousPage > 1) {
          const gap = document.createElement("span");
          gap.textContent = "...";
          gap.setAttribute("aria-hidden", "true");
          pagination.appendChild(gap);
        }
        const btn = document.createElement("button");
        btn.textContent = page;
        btn.classList.toggle("active", page === currentPage);

        btn.addEventListener("click", async () => {
          currentPage = page;
          if (serverPaginated) await loadProductsFromBackend();
          renderProducts();
        });

        pagination.appendChild(btn);
        previousPage = page;
      }

      const nextBtn = document.createElement("button");
      nextBtn.textContent = "Próxima";
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener("click", async () => {
        if (currentPage < totalPages) {
          currentPage++;
          if (serverPaginated) await loadProductsFromBackend();
          renderProducts();
        }
      });

      pagination.appendChild(nextBtn);
    }

    function updateCartView() {
      cartList.innerHTML = "";

      if (!cartActive) {
        cartList.innerHTML = '<div class="cart-empty">O carrinho não está ativo</div>';
        cartCount.textContent = "0";
        syncOrderControls();
        return;
      }

      if (clientOrders.length >= maxClientOrders) {
        cartList.innerHTML = '<div class="cart-empty">Limite de 3 pedidos atingido. Exclua ou entregue um pedido para liberar o carrinho.</div>';
        cartCount.textContent = "0";
        syncOrderControls();
        return;
      }

      const items = Object.values(cart);

      const header = document.createElement("div");
      header.className = "cart-header";
      header.innerHTML = `
        <div class="cart-header-title">
          Pedido de ${escapeHtml(clientName) || "cliente não informado"}
        </div>
        <div class="cart-client-email">
          Email vinculado: ${escapeHtml(clientEmail) || "email não informado"}
        </div>
        <button class="btn success" id="finishOrderBtn">Concluído</button>
        <button class="btn cancel" id="cancelOrderBtn">Cancelar pedido</button>
      `;

      cartList.appendChild(header);

      const body = document.createElement("div");
      body.className = "cart-body";

      if (items.length === 0) {
        body.innerHTML = '<div class="cart-empty">Seu carrinho está vazio</div>';
      } else {
        items.forEach(item => {
          const div = document.createElement("div");
          div.classList.add("cart-item");

          div.innerHTML = `
            <div class="cart-item-info">
              <strong>${escapeHtml(item.name)}</strong>
              <span>Quantidade: ${item.qty}</span>
              <span>Preço total: ${formatMoney(item.price * item.qty)}</span>
            </div>

            <div class="cart-item-actions">
              <button class="cart-action-btn" data-action="cart-add" data-id="${escapeHtml(item.id)}">+</button>
              <button class="cart-action-btn remove" data-action="cart-remove" data-id="${escapeHtml(item.id)}">-</button>
            </div>
          `;

          body.appendChild(div);
        });
      }

      cartList.appendChild(body);

      const total = items.reduce((acc, item) => acc + item.price * item.qty, 0);
      const totalCount = items.reduce((acc, item) => acc + item.qty, 0);

      const footer = document.createElement("div");
      footer.className = "cart-footer";
      footer.innerHTML = `
        <span>Total do pedido</span>
        <span>${formatMoney(total)}</span>
      `;

      cartList.appendChild(footer);
      cartCount.textContent = totalCount;

      document.getElementById("finishOrderBtn").addEventListener("click", finishOrder);
      document.getElementById("cancelOrderBtn").addEventListener("click", cancelOrder);

      cartList.querySelectorAll("[data-action='cart-add']").forEach(button => {
        button.addEventListener("click", () => addToCart(Number(button.dataset.id)));
      });

      cartList.querySelectorAll("[data-action='cart-remove']").forEach(button => {
        button.addEventListener("click", () => removeFromCart(Number(button.dataset.id)));
      });

      syncOrderControls();
    }

    function renderClientOrdersList() {
      clientOrdersList.innerHTML = "";

      const header = document.createElement("div");
      header.className = "orders-list-header";
      header.innerHTML = `
        <div class="orders-list-title">Pedidos de ${escapeHtml(clientName) || "cliente"}</div>
        <div class="cart-client-email">Máximo de pedidos ativos: ${clientOrders.length}/${maxClientOrders}</div>
      `;

      clientOrdersList.appendChild(header);

      const body = document.createElement("div");
      body.className = "orders-list-body";

      if (!clientOrders.length) {
        body.innerHTML = '<div class="orders-empty">Nenhum pedido encontrado.</div>';
      } else {
        clientOrders.slice(0, 3).forEach(order => {
          const card = document.createElement("div");
          card.className = "client-order-card";

          card.innerHTML = `
            <button class="delete-order-btn" data-delete-order="${escapeHtml(order.id)}">X</button>
            <strong>${formatMoney(order.total)}</strong>
            <span>${formatDateTime(order.createdAt)}</span>
          `;

          card.addEventListener("click", () => openClientOrderDetail(order.id));

          card.querySelector("[data-delete-order]").addEventListener("click", event => {
            event.stopPropagation();
            deleteClientOrder(order.id);
          });

          body.appendChild(card);
        });
      }

      clientOrdersList.appendChild(body);
      syncOrderControls();
    }

    function addToCart(productId) {
      if (!cartActive) {
        alert("O carrinho não está ativo. Para ativar, inicie um pedido.");
        return;
      }

      if (clientOrders.length >= maxClientOrders) {
        alert("Você atingiu o máximo de 3 pedidos. Exclua ou entregue um pedido para liberar o carrinho.");
        syncOrderControls();
        return;
      }

      const product = products.find(item => item.id === productId);
      if (!product) return;

      if (!cart[productId]) {
        cart[productId] = {
          id: product.id,
          name: product.name,
          price: product.price,
          qty: 0
        };
      }

      cart[productId].qty++;
      updateCartView();
    }

    function removeFromCart(productId) {
      if (!cart[productId]) return;

      cart[productId].qty--;

      if (cart[productId].qty <= 0) {
        delete cart[productId];
      }

      updateCartView();
    }

    function buildOrderPayload() {
      const items = Object.values(cart);
      const total = items.reduce((acc, item) => acc + item.price * item.qty, 0);

      return {
        id: `PEDIDO-${Date.now()}`,
        customerEmail: clientEmail,
        customerData: clientData,
        items: items.map(item => ({
          productId: item.id,
          name: item.name,
          quantity: item.qty,
          unitPrice: item.price,
          totalPrice: item.price * item.qty
        })),
        total,
        createdAt: new Date().toISOString(),
        source: "produtos.html",
        backendReady: true,
        status: "pendente"
      };
    }

    async function finishOrder() {
      const items = Object.values(cart);

      if (!items.length) {
        alert("Não há itens no pedido.");
        return;
      }

      if (clientOrders.length >= maxClientOrders) {
        alert("Você atingiu o máximo de 3 pedidos. Exclua ou entregue um pedido para liberar o carrinho.");
        syncOrderControls();
        return;
      }

      const orderPayload = buildOrderPayload();

      if (shouldUseProductionBackend()) {
        try {
          const response = await ordersApiFetch("/orders", {
            method: "POST",
            body: JSON.stringify({
              customerName: clientData.fullName,
              customerEmail: clientData.email,
              customerPhone: clientData.phone,
              paymentMethod: "other",
              notes: "Pedido criado em produtos.html",
              items: orderPayload.items.map(item => ({
                productId: item.productId,
                quantity: item.quantity
              }))
            })
          });
          clientOrders.unshift(mapOrderFromApi(response.order));
          clientOrders = clientOrders.slice(0, maxClientOrders);
          alert(`Pedido de ${clientName} criado no backend com sucesso.`);
        } catch (error) {
          alert(error.message || "Nao foi possivel criar o pedido.");
          return;
        }

        cart = {};
        cartList.classList.remove("active");
        updateCartView();
        renderClientOrdersList();
        return;
      }

      clientOrders.unshift(orderPayload);
      clientOrders = clientOrders.slice(0, maxClientOrders);
      saveClientOrders();

      sessionStorage.setItem(
        getOperationalStorageKey("nextstockUltimoPedido"),
        JSON.stringify(orderPayload)
      );

      document.dispatchEvent(
        new CustomEvent("nextstock:pedido-criado", {
          detail: orderPayload
        })
      );

      alert(`Pedido de ${clientName} vinculado ao email ${clientEmail} e concluído no frontend.`);

      cart = {};
      cartList.classList.remove("active");
      updateCartView();
      renderClientOrdersList();
    }

    function cancelOrder() {
      const confirmCancel = confirm("Deseja cancelar este pedido?");
      if (!confirmCancel) return;

      cart = {};
      cartList.classList.remove("active");
      updateCartView();
    }

    async function deleteClientOrder(orderId) {
      const confirmDelete = confirm("Deseja excluir este pedido?");
      if (!confirmDelete) return;

      if (shouldUseProductionBackend()) {
        try {
          await ordersApiFetch(`/orders/${orderId}/cancel`, {
            method: "PATCH",
            body: JSON.stringify({ cancellationReason: "Cancelado pelo cliente em produtos.html" })
          });
          await loadClientOrdersFromBackend();
        } catch (error) {
          alert(error.message || "Nao foi possivel cancelar o pedido.");
          return;
        }
        renderClientOrdersList();
        updateCartView();
        return;
      }

      clientOrders = clientOrders.filter(order => order.id !== orderId);
      saveClientOrders();
      renderClientOrdersList();
      updateCartView();
    }

    function openClientOrderDetail(orderId) {
      const order = clientOrders.find(item => item.id === orderId);
      if (!order) return;

      orderDetailTotal.textContent = formatMoney(order.total);
      orderDetailDate.textContent = formatDateTime(order.createdAt);

      orderDetailProducts.textContent = "";
      order.items.forEach((item) => {
        const row = document.createElement("div");
        row.className = "order-product-row";
        [item.name, formatMoney(item.totalPrice), item.quantity].forEach((value) => {
          const cell = document.createElement("div");
          cell.textContent = String(value ?? "");
          row.appendChild(cell);
        });
        orderDetailProducts.appendChild(row);
      });

      clientOrderDetailOverlay.classList.add("active");
    }

    function closeClientOrderDetails() {
      clientOrderDetailOverlay.classList.remove("active");
    }

    async function openProductDetails(productId) {
      let product = products.find(item => item.id === productId);
      if (!product) return;
      if (shouldUseProductionBackend()) {
        try {
          const selectedBranch = JSON.parse(
            sessionStorage.getItem("nextstockSelectedBranch") || "null"
          );
          const response = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
            credentials: "include",
            headers: selectedBranch?.id
              ? { "x-nextstock-branch-id": selectedBranch.id }
              : {}
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok && data.product) product = mapApiProduct(data.product);
        } catch {
          // Mantem o resumo da listagem como fallback.
        }
      }

      selectedProduct = product;
      carouselIndex = 0;

      detailTitle.textContent = product.name;
      detailName.textContent = product.name;
      detailPrice.textContent = formatMoney(product.price);
      detailCode.textContent = product.code;
      detailCategory.textContent = product.category;
      detailStock.textContent = product.stock;
      detailDescription.textContent = product.description;

      renderCarousel();
      productDetailOverlay.classList.add("active");
    }

    function renderCarousel() {
      if (!selectedProduct) return;

      const images = selectedProduct.images;
      const image = images[carouselIndex];

      carouselView.textContent = "";
      carouselView.appendChild(createSafeImage(image, selectedProduct.name));
      carouselCounter.textContent = `${carouselIndex + 1} de ${images.length}`;

      prevImageBtn.style.visibility = images.length > 1 ? "visible" : "hidden";
      nextImageBtn.style.visibility = images.length > 1 ? "visible" : "hidden";
    }

    function closeProductDetails() {
      productDetailOverlay.classList.remove("active");
      selectedProduct = null;
      carouselIndex = 0;
    }

    async function buscarCepViaCep() {
      const cep = onlyNumbers(clientCepInput.value);

      if (cep.length !== 8) return;

      try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();

        if (data.erro) {
          alert("CEP não encontrado. Revise os dados por segurança.");
          return;
        }

        clientStateInput.value = data.uf || "";
        clientCityInput.value = data.localidade || "";
        clientNeighborhoodInput.value = data.bairro || "";
        clientStreetInput.value = data.logradouro || "";
        clientComplementInput.value = data.complemento || "";
      } catch (error) {
        alert("Não foi possível consultar o CEP agora. Preencha os dados manualmente.");
      }
    }

    function getClientDataFromForm() {
      return {
        email: clientEmailInput.value.trim(),
        fullName: clientFullNameInput.value.trim(),
        phone: clientPhoneInput.value.trim(),
        cep: clientCepInput.value.trim(),
        state: clientStateInput.value.trim(),
        city: clientCityInput.value.trim(),
        neighborhood: clientNeighborhoodInput.value.trim(),
        houseNumber: clientHouseNumberInput.value.trim(),
        street: clientStreetInput.value.trim(),
        complement: clientComplementInput.value.trim()
      };
    }

    function validateClientData(data) {
      return (
        data.email &&
        data.fullName &&
        data.phone &&
        data.cep &&
        data.state &&
        data.city &&
        data.neighborhood &&
        data.houseNumber &&
        data.street
      );
    }

    function resetClientForm() {
      clientEmailInput.value = "";
      clientFullNameInput.value = "";
      clientPhoneInput.value = "";
      clientCepInput.value = "";
      clientStateInput.value = "";
      clientCityInput.value = "";
      clientNeighborhoodInput.value = "";
      clientHouseNumberInput.value = "";
      clientStreetInput.value = "";
      clientComplementInput.value = "";
    }

    function closeOrderBoxesAndBlockActions() {
      cartActive = false;
      clientName = "";
      clientEmail = "";
      clientData = null;
      cart = {};
      clientOrders = [];

      orderOverlay.classList.remove("active");
      orderOverlay.classList.remove("client-data-mode");
      clientNameBox.classList.remove("active");
      document.querySelector(".initial-order-buttons").style.display = "";
      cartList.classList.remove("active");
      clientOrdersList.classList.remove("active");

      resetClientForm();
      updateCartView();
      syncOrderControls();
    }

    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    cartBtn.addEventListener("click", () => {
      if (!cartActive || clientOrders.length >= maxClientOrders) return;
      cartList.classList.toggle("active");
      clientOrdersList.classList.remove("active");
    });

    ordersBtn.addEventListener("click", () => {
      if (!clientEmail) return;
      renderClientOrdersList();
      clientOrdersList.classList.toggle("active");
      cartList.classList.remove("active");
    });

    startOrderYes.addEventListener("click", () => {
      orderOverlay.classList.add("client-data-mode");
      clientNameBox.classList.add("active");
      document.querySelector(".initial-order-buttons").style.display = "none";
      clientEmailInput.focus();
    });

    startOrderNo.addEventListener("click", () => {
      closeOrderBoxesAndBlockActions();
    });

    cancelClientDataBtn.addEventListener("click", () => {
      closeOrderBoxesAndBlockActions();
    });

    clientCepInput.addEventListener("blur", buscarCepViaCep);

    clientCepInput.addEventListener("input", () => {
      const cep = onlyNumbers(clientCepInput.value).slice(0, 8);

      if (cep.length > 5) {
        clientCepInput.value = `${cep.slice(0, 5)}-${cep.slice(5)}`;
      } else {
        clientCepInput.value = cep;
      }
    });

    confirmClientName.addEventListener("click", () => {
      const data = getClientDataFromForm();

      if (!validateClientData(data)) {
        alert("Preencha todos os dados obrigatórios do cliente. Revise os dados por segurança.");
        return;
      }

      clientData = data;
      clientName = data.fullName;
      clientEmail = data.email;
      cartActive = true;

      loadClientOrders();
      if (shouldUseProductionBackend()) {
        loadClientOrdersFromBackend().then(() => {
          renderClientOrdersList();
          syncOrderControls();
        });
      }
      orderOverlay.classList.remove("active");
      orderOverlay.classList.remove("client-data-mode");
      clientNameBox.classList.remove("active");
      updateCartView();
      renderClientOrdersList();
      syncOrderControls();

      if (clientOrders.length >= maxClientOrders) {
        alert("Este cliente já possui 3 pedidos ativos. O carrinho ficará bloqueado até algum pedido ser entregue ou excluído.");
      }
    });

    closeDetailModal.addEventListener("click", closeProductDetails);

    productDetailOverlay.addEventListener("click", (event) => {
      if (event.target === productDetailOverlay) {
        closeProductDetails();
      }
    });

    closeClientOrderDetail.addEventListener("click", closeClientOrderDetails);

    clientOrderDetailOverlay.addEventListener("click", (event) => {
      if (event.target === clientOrderDetailOverlay) {
        closeClientOrderDetails();
      }
    });

    prevImageBtn.addEventListener("click", () => {
      if (!selectedProduct) return;

      carouselIndex = carouselIndex === 0
        ? selectedProduct.images.length - 1
        : carouselIndex - 1;

      renderCarousel();
    });

    nextImageBtn.addEventListener("click", () => {
      if (!selectedProduct) return;

      carouselIndex = carouselIndex === selectedProduct.images.length - 1
        ? 0
        : carouselIndex + 1;

      renderCarousel();
    });

    detailAddToCart.addEventListener("click", () => {
      if (!selectedProduct) return;
      addToCart(selectedProduct.id);
    });

    searchInput.addEventListener("input", () => {
      currentPage = 1;
      clearTimeout(productsSearchTimer);
      productsSearchTimer = setTimeout(async () => {
        if (shouldUseProductionBackend()) await loadProductsFromBackend();
        renderProducts();
      }, 300);
    });

    minPriceInput.addEventListener("input", () => {
      currentPage = 1;
      renderProducts();
    });

    async function initProductsPage() {
      await loadProductsFromBackend();
      renderProducts();
      updateCartView();
      syncOrderControls();
    }

    initProductsPage();
  
