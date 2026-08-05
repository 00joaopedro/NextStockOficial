    if (window.isNextStockDemoMode?.()) {
    const DEMO_SALES_DATA = [
      {
        id: "REC-65-0001",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Mariana Souza",
        pagamento: "Cartão de crédito",
        maquina: "Stone - Caixa Principal",
        data: "2026-04-18",
        dataFormatada: "18/04/2026",
        hora: "14:22:31",
        produtos: [
          { nome: "Ração Premium 10kg", qtd: 1, valor: 189.90 },
          { nome: "Shampoo Pet Neutro", qtd: 2, valor: 24.50 },
          { nome: "Brinquedo Mordedor", qtd: 1, valor: 18.90 },
          { nome: "Coleira Ajustável", qtd: 1, valor: 29.90 },
          { nome: "Petisco Natural", qtd: 3, valor: 12.90 },
          { nome: "Tapete Higiênico", qtd: 1, valor: 42.00 }
        ]
      },
      {
        id: "NF-55-0001",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Lucas Almeida",
        pagamento: "PIX",
        maquina: "Não utilizada",
        data: "2026-04-19",
        dataFormatada: "19/04/2026",
        hora: "09:11:08",
        produtos: [
          { nome: "Areia Higiênica 12kg", qtd: 3, valor: 34.90 },
          { nome: "Coleira Antipulgas", qtd: 2, valor: 59.90 },
          { nome: "Tapete Higiênico c/30", qtd: 1, valor: 42.00 }
        ]
      },
      {
        id: "REC-65-0002",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Carla Menezes",
        pagamento: "Dinheiro",
        maquina: "Não utilizada",
        data: "2026-04-20",
        dataFormatada: "20/04/2026",
        hora: "10:42:19",
        produtos: [
          { nome: "Ração Filhote 3kg", qtd: 1, valor: 79.90 },
          { nome: "Comedouro Inox", qtd: 1, valor: 22.90 }
        ]
      },
      {
        id: "NF-55-0002",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Rafael Costa",
        pagamento: "Boleto",
        maquina: "Não utilizada",
        data: "2026-04-20",
        dataFormatada: "20/04/2026",
        hora: "11:08:44",
        produtos: [
          { nome: "Ração Adulto 15kg", qtd: 4, valor: 219.90 },
          { nome: "Vermífugo Pet", qtd: 2, valor: 35.00 }
        ]
      },
      {
        id: "REC-65-0003",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Mariana Souza",
        pagamento: "Cartão de débito",
        maquina: "PagSeguro - Balcão",
        data: "2026-04-21",
        dataFormatada: "21/04/2026",
        hora: "15:34:57",
        produtos: [
          { nome: "Brinquedo Bola", qtd: 2, valor: 14.90 },
          { nome: "Osso Defumado", qtd: 5, valor: 7.50 }
        ]
      },
      {
        id: "NF-55-0003",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Lucas Almeida",
        pagamento: "PIX",
        maquina: "Não utilizada",
        data: "2026-04-21",
        dataFormatada: "21/04/2026",
        hora: "16:12:03",
        produtos: [
          { nome: "Shampoo Antipulgas", qtd: 3, valor: 31.90 },
          { nome: "Condicionador Pet", qtd: 2, valor: 27.90 }
        ]
      },
      {
        id: "REC-65-0004",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Bruna Rocha",
        pagamento: "Cartão de crédito",
        maquina: "Mercado Pago - Caixa 2",
        data: "2026-04-22",
        dataFormatada: "22/04/2026",
        hora: "08:45:16",
        produtos: [
          { nome: "Guia Retrátil", qtd: 1, valor: 69.90 },
          { nome: "Coleira Peitoral", qtd: 1, valor: 54.90 }
        ]
      },
      {
        id: "NF-55-0004",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Rafael Costa",
        pagamento: "Transferência",
        maquina: "Não utilizada",
        data: "2026-04-22",
        dataFormatada: "22/04/2026",
        hora: "13:20:25",
        produtos: [
          { nome: "Areia Sílica 8kg", qtd: 6, valor: 49.90 },
          { nome: "Pá Higiênica", qtd: 3, valor: 11.90 }
        ]
      },
      {
        id: "REC-65-0005",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Carla Menezes",
        pagamento: "PIX",
        maquina: "Não utilizada",
        data: "2026-04-23",
        dataFormatada: "23/04/2026",
        hora: "17:01:40",
        produtos: [
          { nome: "Petisco Dental", qtd: 4, valor: 16.90 },
          { nome: "Escova Dental Pet", qtd: 1, valor: 18.00 }
        ]
      },
      {
        id: "NF-55-0005",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Bruna Rocha",
        pagamento: "Cartão de crédito",
        maquina: "Stone - Caixa Principal",
        data: "2026-04-23",
        dataFormatada: "23/04/2026",
        hora: "18:12:58",
        produtos: [
          { nome: "Ração Premium 20kg", qtd: 2, valor: 329.90 },
          { nome: "Suplemento Vitamínico", qtd: 2, valor: 45.90 }
        ]
      },
      {
        id: "REC-65-0006",
        tipo: "65",
        titulo: "Recibo 65 - Venda no caixa",
        vendedor: "Mariana Souza",
        pagamento: "Cartão de débito",
        maquina: "PagSeguro - Balcão",
        data: "2026-04-24",
        dataFormatada: "24/04/2026",
        hora: "09:33:12",
        produtos: [
          { nome: "Bebedouro Automático", qtd: 1, valor: 119.90 },
          { nome: "Filtro Refil", qtd: 2, valor: 19.90 }
        ]
      },
      {
        id: "NF-55-0006",
        tipo: "55",
        titulo: "Nota Fiscal 55 - Venda faturada",
        vendedor: "Lucas Almeida",
        pagamento: "Boleto",
        maquina: "Não utilizada",
        data: "2026-04-24",
        dataFormatada: "24/04/2026",
        hora: "10:15:37",
        produtos: [
          { nome: "Kit Banho Pet", qtd: 5, valor: 89.90 },
          { nome: "Toalha Pet", qtd: 5, valor: 24.90 }
        ]
      }
    ];
    const salesData = window.isNextStockDemoMode?.() ? DEMO_SALES_DATA : [];

    const ITEMS_PER_PAGE = 10;
    let currentPage = 1;
    let filteredSales = [...salesData];

    const salesGrid = document.getElementById("salesGrid");
    const searchSeller = document.getElementById("searchSeller");
    const filterDate = document.getElementById("filterDate");
    const filterMinValue = document.getElementById("filterMinValue");
    const emptyMessage = document.getElementById("emptyMessage");
    const pagination = document.getElementById("pagination");

    const overlay = document.getElementById("overlay");
    const closeModal = document.getElementById("closeModal");
    const closeModal2 = document.getElementById("closeModal2");
    const detailTitle = document.getElementById("detailTitle");
    const detailSummary = document.getElementById("detailSummary");
    const productsList = document.getElementById("productsList");
    const printBtn = document.getElementById("printBtn");

    function formatMoney(value) {
      return Number(value).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function getSaleTotal(produtos) {
      return produtos.reduce((acc, item) => acc + item.qtd * item.valor, 0);
    }

    function createCard(sale) {
      const card = document.createElement("div");
      card.className = "sale-card";

      const tipoClass = sale.tipo === "65" ? "receipt" : "invoice";
      const tipoLabel = sale.tipo === "65" ? "Recibo 65" : "Nota Fiscal 55";

      card.innerHTML = `
        <div class="sale-top">
          <div class="sale-type ${tipoClass}">${tipoLabel}</div>
          <div class="sale-id">${sale.id}</div>
        </div>

        <div class="sale-title">${sale.titulo}</div>

        <div class="sale-info">
          <div class="info-box">
            <span>Nome do vendedor</span>
            <strong>${sale.vendedor}</strong>
          </div>

          <div class="info-box">
            <span>Formato de pagamento</span>
            <strong>${sale.pagamento}</strong>
          </div>

          <div class="info-box">
            <span>Máquina de cartão usada</span>
            <strong>${sale.maquina}</strong>
          </div>

          <div class="info-box">
            <span>Data da venda</span>
            <strong>${sale.dataFormatada}</strong>
          </div>

          <div class="info-box">
            <span>Hora da venda</span>
            <strong>${sale.hora}</strong>
          </div>

          <div class="info-box">
            <span>Total da venda</span>
            <strong>${formatMoney(getSaleTotal(sale.produtos))}</strong>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openDetails(sale));
      return card;
    }

    function renderSales() {
      salesGrid.innerHTML = "";

      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const end = start + ITEMS_PER_PAGE;
      const pageItems = filteredSales.slice(start, end);

      if (!pageItems.length) {
        emptyMessage.style.display = "block";
        pagination.innerHTML = "";
        return;
      }

      emptyMessage.style.display = "none";
      pageItems.forEach(sale => salesGrid.appendChild(createCard(sale)));

      renderPagination();
    }

    function renderPagination() {
      pagination.innerHTML = "";

      const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);

      if (totalPages <= 1) return;

      const prevBtn = document.createElement("button");
      prevBtn.className = "page-btn";
      prevBtn.textContent = "Anterior";
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener("click", () => {
        currentPage--;
        renderSales();
      });

      pagination.appendChild(prevBtn);

      for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.className = `page-btn ${i === currentPage ? "active" : ""}`;
        btn.textContent = i;
        btn.addEventListener("click", () => {
          currentPage = i;
          renderSales();
        });
        pagination.appendChild(btn);
      }

      const nextBtn = document.createElement("button");
      nextBtn.className = "page-btn";
      nextBtn.textContent = "Próxima";
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener("click", () => {
        currentPage++;
        renderSales();
      });

      pagination.appendChild(nextBtn);
    }

    function filterSales() {
      const sellerValue = searchSeller.value.trim().toLowerCase();
      const dateValue = filterDate.value;
      const minValue = parseFloat(filterMinValue.value) || 0;

      filteredSales = salesData.filter(sale => {
        const total = getSaleTotal(sale.produtos);
        const matchSeller = sale.vendedor.toLowerCase().includes(sellerValue);
        const matchDate = !dateValue || sale.data === dateValue;
        const matchMinValue = total >= minValue;

        return matchSeller && matchDate && matchMinValue;
      });

      currentPage = 1;
      renderSales();
    }

    function openDetails(sale) {
      detailTitle.textContent = `${sale.tipo === "65" ? "Recibo 65" : "Nota Fiscal 55"} - ${sale.id}`;

      detailSummary.innerHTML = `
        <div class="summary-card">
          <span>Vendedor</span>
          <strong>${sale.vendedor}</strong>
        </div>

        <div class="summary-card">
          <span>Pagamento</span>
          <strong>${sale.pagamento}</strong>
        </div>

        <div class="summary-card">
          <span>Máquina</span>
          <strong>${sale.maquina}</strong>
        </div>

        <div class="summary-card">
          <span>Data</span>
          <strong>${sale.dataFormatada}</strong>
        </div>

        <div class="summary-card">
          <span>Hora</span>
          <strong>${sale.hora}</strong>
        </div>

        <div class="summary-card">
          <span>Total</span>
          <strong>${formatMoney(getSaleTotal(sale.produtos))}</strong>
        </div>
      `;

      productsList.innerHTML = sale.produtos.map(produto => `
        <div class="product-row">
          <div><strong>${produto.nome}</strong></div>
          <div>${produto.qtd}</div>
          <div>${formatMoney(produto.valor)}</div>
          <div>${formatMoney(produto.qtd * produto.valor)}</div>
        </div>
      `).join("");

      if (sale.tipo === "65") {
        printBtn.classList.add("show");
        printBtn.onclick = () => window.print();
      } else {
        printBtn.classList.remove("show");
        printBtn.onclick = null;
      }

      overlay.classList.add("active");
    }

    function closeDetails() {
      overlay.classList.remove("active");
    }

    searchSeller.addEventListener("input", filterSales);
    filterDate.addEventListener("input", filterSales);
    filterMinValue.addEventListener("input", filterSales);

    closeModal.addEventListener("click", closeDetails);
    closeModal2.addEventListener("click", closeDetails);

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDetails();
    });

    renderSales();
    }
  
