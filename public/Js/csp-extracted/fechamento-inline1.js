    const DEMO_CLOSING_DATA = [
      {
        id: "FEC-0001",
        funcionario: "Mariana Souza",
        data: "2026-04-29",
        dataFormatada: "29/04/2026",
        abertura: "08:00:00",
        fechamento: "18:15:42",
        status: "Fechado",
        dinheiro: 420.50,
        cartao: 1380.90,
        pix: 760.00,
        descontos: 35.00,
        sangrias: 100.00,
        suprimentos: 50.00,
        qtdVendas: 32,
        pagamentos: [
          { forma: "Dinheiro", quantidade: 8, total: 420.50 },
          { forma: "Cartão", quantidade: 17, total: 1380.90 },
          { forma: "PIX", quantidade: 7, total: 760.00 }
        ]
      },
      {
        id: "FEC-0002",
        funcionario: "Lucas Almeida",
        data: "2026-04-29",
        dataFormatada: "29/04/2026",
        abertura: "09:00:00",
        fechamento: "19:02:18",
        status: "Fechado",
        dinheiro: 280.00,
        cartao: 960.70,
        pix: 520.40,
        descontos: 20.00,
        sangrias: 50.00,
        suprimentos: 0.00,
        qtdVendas: 24,
        pagamentos: [
          { forma: "Dinheiro", quantidade: 5, total: 280.00 },
          { forma: "Cartão", quantidade: 12, total: 960.70 },
          { forma: "PIX", quantidade: 7, total: 520.40 }
        ]
      },
      {
        id: "FEC-0003",
        funcionario: "Carla Menezes",
        data: "2026-04-28",
        dataFormatada: "28/04/2026",
        abertura: "08:10:00",
        fechamento: "18:00:31",
        status: "Fechado",
        dinheiro: 610.30,
        cartao: 740.20,
        pix: 430.90,
        descontos: 15.50,
        sangrias: 80.00,
        suprimentos: 40.00,
        qtdVendas: 27,
        pagamentos: [
          { forma: "Dinheiro", quantidade: 11, total: 610.30 },
          { forma: "Cartão", quantidade: 9, total: 740.20 },
          { forma: "PIX", quantidade: 7, total: 430.90 }
        ]
      },
      {
        id: "FEC-0004",
        funcionario: "Bruna Rocha",
        data: "2026-04-28",
        dataFormatada: "28/04/2026",
        abertura: "10:00:00",
        fechamento: "17:45:08",
        status: "Em aberto",
        dinheiro: 190.00,
        cartao: 510.90,
        pix: 320.00,
        descontos: 0.00,
        sangrias: 0.00,
        suprimentos: 30.00,
        qtdVendas: 14,
        pagamentos: [
          { forma: "Dinheiro", quantidade: 3, total: 190.00 },
          { forma: "Cartão", quantidade: 7, total: 510.90 },
          { forma: "PIX", quantidade: 4, total: 320.00 }
        ]
      }
    ];
    const closingData = window.isNextStockDemoMode?.() ? DEMO_CLOSING_DATA : [];

    const closingGrid = document.getElementById("closingGrid");
    const filterDate = document.getElementById("filterDate");
    const searchEmployee = document.getElementById("searchEmployee");
    const emptyMessage = document.getElementById("emptyMessage");

    const summaryTotal = document.getElementById("summaryTotal");
    const summaryCash = document.getElementById("summaryCash");
    const summaryCard = document.getElementById("summaryCard");
    const summaryPix = document.getElementById("summaryPix");

    const overlay = document.getElementById("overlay");
    const detailTitle = document.getElementById("detailTitle");
    const detailSummary = document.getElementById("detailSummary");
    const paymentList = document.getElementById("paymentList");
    const closeModal = document.getElementById("closeModal");
    const closeModal2 = document.getElementById("closeModal2");
    const printBtn = document.getElementById("printBtn");

    function formatMoney(value) {
      return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function getClosingTotal(item) {
      return item.dinheiro + item.cartao + item.pix - item.descontos;
    }

    function renderSummary(data) {
      const totals = data.reduce((acc, item) => {
        acc.total += getClosingTotal(item);
        acc.dinheiro += item.dinheiro;
        acc.cartao += item.cartao;
        acc.pix += item.pix;
        return acc;
      }, {
        total: 0,
        dinheiro: 0,
        cartao: 0,
        pix: 0
      });

      summaryTotal.textContent = formatMoney(totals.total);
      summaryCash.textContent = formatMoney(totals.dinheiro);
      summaryCard.textContent = formatMoney(totals.cartao);
      summaryPix.textContent = formatMoney(totals.pix);
    }

    function createClosingCard(item) {
      const card = document.createElement("div");
      card.className = "closing-card";

      const statusClass = item.status === "Fechado" ? "closed" : "open";

      card.innerHTML = `
        <div class="closing-top">
          <div class="closing-status ${statusClass}">${item.status}</div>
          <div class="closing-id">${item.id}</div>
        </div>

        <div class="closing-title">Fechamento de ${item.funcionario}</div>

        <div class="closing-info">
          <div class="info-box">
            <span>Funcionário</span>
            <strong>${item.funcionario}</strong>
          </div>

          <div class="info-box">
            <span>Dia</span>
            <strong>${item.dataFormatada}</strong>
          </div>

          <div class="info-box">
            <span>Abertura</span>
            <strong>${item.abertura}</strong>
          </div>

          <div class="info-box">
            <span>Fechamento</span>
            <strong>${item.fechamento}</strong>
          </div>

          <div class="info-box">
            <span>Qtd. vendas</span>
            <strong>${item.qtdVendas}</strong>
          </div>

          <div class="info-box">
            <span>Total final</span>
            <strong>${formatMoney(getClosingTotal(item))}</strong>
          </div>
        </div>
      `;

      card.addEventListener("click", () => openDetails(item));
      return card;
    }

    function renderClosing(data) {
      closingGrid.innerHTML = "";

      if (!data.length) {
        emptyMessage.style.display = "block";
        renderSummary([]);
        return;
      }

      emptyMessage.style.display = "none";

      data.forEach(item => {
        closingGrid.appendChild(createClosingCard(item));
      });

      renderSummary(data);
    }

    function filterClosing() {
      const dateValue = filterDate.value;
      const employeeValue = searchEmployee.value.trim().toLowerCase();

      const filtered = closingData.filter(item => {
        const matchDate = !dateValue || item.data === dateValue;
        const matchEmployee = item.funcionario.toLowerCase().includes(employeeValue);

        return matchDate && matchEmployee;
      });

      renderClosing(filtered);
    }

    function openDetails(item) {
      detailTitle.textContent = `Fechamento ${item.id}`;

      detailSummary.innerHTML = `
        <div class="modal-card">
          <span>Funcionário</span>
          <strong>${item.funcionario}</strong>
        </div>

        <div class="modal-card">
          <span>Dia</span>
          <strong>${item.dataFormatada}</strong>
        </div>

        <div class="modal-card">
          <span>Status</span>
          <strong>${item.status}</strong>
        </div>

        <div class="modal-card">
          <span>Abertura</span>
          <strong>${item.abertura}</strong>
        </div>

        <div class="modal-card">
          <span>Fechamento</span>
          <strong>${item.fechamento}</strong>
        </div>

        <div class="modal-card">
          <span>Quantidade de vendas</span>
          <strong>${item.qtdVendas}</strong>
        </div>

        <div class="modal-card">
          <span>Descontos</span>
          <strong>${formatMoney(item.descontos)}</strong>
        </div>

        <div class="modal-card">
          <span>Sangrias</span>
          <strong>${formatMoney(item.sangrias)}</strong>
        </div>

        <div class="modal-card">
          <span>Suprimentos</span>
          <strong>${formatMoney(item.suprimentos)}</strong>
        </div>

        <div class="modal-card">
          <span>Total final</span>
          <strong>${formatMoney(getClosingTotal(item))}</strong>
        </div>
      `;

      paymentList.innerHTML = item.pagamentos.map(payment => `
        <div class="payment-row">
          <div><strong>${payment.forma}</strong></div>
          <div>${payment.quantidade}</div>
          <div>${formatMoney(payment.total)}</div>
        </div>
      `).join("");

      overlay.classList.add("active");
    }

    function closeDetails() {
      overlay.classList.remove("active");
    }

    filterDate.addEventListener("input", filterClosing);
    searchEmployee.addEventListener("input", filterClosing);

    closeModal.addEventListener("click", closeDetails);
    closeModal2.addEventListener("click", closeDetails);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeDetails();
    });

    printBtn.addEventListener("click", () => {
      window.print();
    });

    renderClosing(closingData);
  
