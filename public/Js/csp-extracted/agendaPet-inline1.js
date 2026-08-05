    function isDemoMode() {
      const params = new URLSearchParams(window.location.search);
      return sessionStorage.getItem("nextstockIsPreview") === "true" ||
        sessionStorage.getItem("nextstockPreviewMode") === "true" ||
        sessionStorage.getItem("nextstockBackendMode") === "preview" ||
        params.get("mode") === "preview" ||
        params.get("mode") === "visualizacao";
    }

    const DEMO_ATENDIMENTOS = [
      {
        id: 1,
        cliente: "Mariana Oliveira Santos",
        animal: "Thor",
        atendente: "Carlos",
        servico: "Banho e tosa",
        data: "2026-04-12",
        hora: "14:00",
        preco: "85.00",
        descricao: "Banho completo, tosa higiênica e corte de unhas."
      },
      {
        id: 2,
        cliente: "Mariana Oliveira Santos",
        animal: "Luna",
        atendente: "Fernanda",
        servico: "Consulta veterinária",
        data: "2026-04-18",
        hora: "09:30",
        preco: "120.00",
        descricao: "Avaliação geral e acompanhamento anual."
      },
      {
        id: 3,
        cliente: "João Batista Lima",
        animal: "Rex",
        atendente: "Carlos",
        servico: "Banho",
        data: "2026-04-20",
        hora: "10:00",
        preco: "55.00",
        descricao: "Banho simples com secagem."
      },
      {
        id: 4,
        cliente: "Ana Souza",
        animal: "Mel",
        atendente: "Juliana",
        servico: "Tosa",
        data: "2026-05-03",
        hora: "15:30",
        preco: "70.00",
        descricao: "Tosa completa da raça."
      },
      {
        id: 5,
        cliente: "Pedro Henrique",
        animal: "Bidu",
        atendente: "Carlos",
        servico: "Consulta veterinária",
        data: "2026-05-10",
        hora: "11:15",
        preco: "130.00",
        descricao: "Consulta por queda de apetite."
      }
    ];
    let atendimentos = isDemoMode() ? DEMO_ATENDIMENTOS : [];

    const itemsPerPage = 12;
    let currentPage = 1;
    let filteredAtendimentos = [...atendimentos];
    let cardIdToDelete = null;

    const atendenteSearch = document.getElementById("atendenteSearch");
    const dateFilterType = document.getElementById("dateFilterType");
    const dateDay = document.getElementById("dateDay");
    const dateWeek = document.getElementById("dateWeek");
    const dateMonth = document.getElementById("dateMonth");
    const dateYear = document.getElementById("dateYear");

    const dayField = document.getElementById("dayField");
    const weekField = document.getElementById("weekField");
    const monthField = document.getElementById("monthField");
    const yearField = document.getElementById("yearField");

    const applyFiltersBtn = document.getElementById("applyFiltersBtn");
    const clearFiltersBtn = document.getElementById("clearFiltersBtn");
    const agendaContainer = document.getElementById("agendaContainer");
    const resultsCount = document.getElementById("resultsCount");
    const pagination = document.getElementById("pagination");

    const confirmOverlay = document.getElementById("confirmOverlay");
    const confirmDeleteYes = document.getElementById("confirmDeleteYes");
    const confirmDeleteNo = document.getElementById("confirmDeleteNo");

    function populateYearOptions() {
      const anos = [...new Set(atendimentos.map(item => new Date(item.data).getFullYear()))].sort((a, b) => a - b);
      dateYear.innerHTML = '<option value="">Selecione</option>';

      anos.forEach(ano => {
        const option = document.createElement("option");
        option.value = ano;
        option.textContent = ano;
        dateYear.appendChild(option);
      });
    }

    function updateDateFields() {
      dayField.classList.add("hidden");
      weekField.classList.add("hidden");
      monthField.classList.add("hidden");
      yearField.classList.add("hidden");

      const type = dateFilterType.value;

      if (type === "day") dayField.classList.remove("hidden");
      if (type === "week") weekField.classList.remove("hidden");
      if (type === "month") monthField.classList.remove("hidden");
      if (type === "year") yearField.classList.remove("hidden");
    }

    function getWeekNumber(date) {
      const tempDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = tempDate.getUTCDay() || 7;
      tempDate.setUTCDate(tempDate.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(tempDate.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
      return weekNo;
    }

    function renderAgenda(items) {
      agendaContainer.innerHTML = "";

      resultsCount.textContent = `${items.length} agendamento(s) encontrado(s)`;

      if (!items.length) {
        agendaContainer.innerHTML = `
          <div class="empty-state">
            Nenhum agendamento encontrado com os filtros selecionados.
          </div>
        `;
        pagination.innerHTML = "";
        return;
      }

      const totalPages = Math.ceil(items.length / itemsPerPage);

      if (currentPage > totalPages) {
        currentPage = totalPages;
      }

      const start = (currentPage - 1) * itemsPerPage;
      const end = start + itemsPerPage;
      const pageItems = items.slice(start, end);

      pageItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "agenda-card";

        card.innerHTML = `
          <button class="delete-card-btn" type="button" data-delete-id="${item.id}">X</button>

          <div class="agenda-card-header">
            <div class="badge">${item.servico}</div>
          </div>

          <div class="agenda-title">${item.cliente} - ${item.animal}</div>

          <div class="agenda-meta">
            <div class="agenda-meta-row">
              <span>Atendente</span>
              <span>${item.atendente}</span>
            </div>
            <div class="agenda-meta-row">
              <span>Data</span>
              <span>${formatDateBR(item.data)}</span>
            </div>
            <div class="agenda-meta-row">
              <span>Hora</span>
              <span>${item.hora}</span>
            </div>
            <div class="agenda-meta-row">
              <span>Preço</span>
              <span>R$ ${item.preco}</span>
            </div>
          </div>

          <div class="agenda-desc">${item.descricao}</div>
        `;

        card.querySelector("[data-delete-id]").addEventListener("click", () => {
          openDeleteConfirm(item.id);
        });

        agendaContainer.appendChild(card);
      });

      renderPagination(items);
    }

    function renderPagination(items) {
      const totalPages = Math.ceil(items.length / itemsPerPage);
      pagination.innerHTML = "";

      if (totalPages <= 1) return;

      const prevBtn = document.createElement("button");
      prevBtn.textContent = "Anterior";
      prevBtn.disabled = currentPage === 1;
      prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          renderAgenda(filteredAtendimentos);
        }
      });

      pagination.appendChild(prevBtn);

      for (let page = 1; page <= totalPages; page++) {
        const btn = document.createElement("button");
        btn.textContent = page;
        btn.classList.toggle("active", page === currentPage);

        btn.addEventListener("click", () => {
          currentPage = page;
          renderAgenda(filteredAtendimentos);
        });

        pagination.appendChild(btn);
      }

      const nextBtn = document.createElement("button");
      nextBtn.textContent = "Próxima";
      nextBtn.disabled = currentPage === totalPages;
      nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          renderAgenda(filteredAtendimentos);
        }
      });

      pagination.appendChild(nextBtn);
    }

    function formatDateBR(dateString) {
      const [year, month, day] = dateString.split("-");
      return `${day}/${month}/${year}`;
    }

    function getFilteredAgenda() {
      const atendenteTermo = atendenteSearch.value.trim().toLowerCase();
      const tipoData = dateFilterType.value;

      let filtrados = [...atendimentos];

      if (atendenteTermo) {
        filtrados = filtrados.filter(item =>
          item.atendente.toLowerCase().includes(atendenteTermo)
        );
      }

      if (tipoData === "day" && dateDay.value) {
        filtrados = filtrados.filter(item => item.data === dateDay.value);
      }

      if (tipoData === "week" && dateWeek.value) {
        const [weekYear, weekNum] = dateWeek.value.split("-W");
        filtrados = filtrados.filter(item => {
          const data = new Date(item.data + "T00:00:00");
          return String(data.getFullYear()) === weekYear && String(getWeekNumber(data)).padStart(2, "0") === weekNum;
        });
      }

      if (tipoData === "month" && dateMonth.value) {
        filtrados = filtrados.filter(item => item.data.startsWith(dateMonth.value));
      }

      if (tipoData === "year" && dateYear.value) {
        filtrados = filtrados.filter(item => new Date(item.data).getFullYear() === Number(dateYear.value));
      }

      return filtrados;
    }

    function applyFilters() {
      filteredAtendimentos = getFilteredAgenda();
      currentPage = 1;
      renderAgenda(filteredAtendimentos);
    }

    function clearFilters() {
      atendenteSearch.value = "";
      dateFilterType.value = "";
      dateDay.value = "";
      dateWeek.value = "";
      dateMonth.value = "";
      dateYear.value = "";
      updateDateFields();

      filteredAtendimentos = [...atendimentos];
      currentPage = 1;
      renderAgenda(filteredAtendimentos);
    }

    function openDeleteConfirm(id) {
      cardIdToDelete = id;
      confirmOverlay.classList.add("active");
    }

    function closeDeleteConfirm() {
      cardIdToDelete = null;
      confirmOverlay.classList.remove("active");
    }

    function confirmDeleteCard() {
      if (cardIdToDelete === null) return;
      if (!isDemoMode()) {
        alert("Operacao local bloqueada em producao. Use a API real da agenda.");
        closeDeleteConfirm();
        return;
      }

      atendimentos = atendimentos.filter(item => item.id !== cardIdToDelete);
      filteredAtendimentos = getFilteredAgenda();

      const totalPages = Math.ceil(filteredAtendimentos.length / itemsPerPage);

      if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
      }

      closeDeleteConfirm();
      populateYearOptions();
      renderAgenda(filteredAtendimentos);
    }

    dateFilterType.addEventListener("change", updateDateFields);
    applyFiltersBtn.addEventListener("click", applyFilters);
    clearFiltersBtn.addEventListener("click", clearFilters);

    confirmDeleteYes.addEventListener("click", confirmDeleteCard);
    confirmDeleteNo.addEventListener("click", closeDeleteConfirm);

    confirmOverlay.addEventListener("click", event => {
      if (event.target === confirmOverlay) {
        closeDeleteConfirm();
      }
    });

    populateYearOptions();
    updateDateFields();
    renderAgenda(filteredAtendimentos);
  
