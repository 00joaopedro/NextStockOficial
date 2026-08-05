    if (window.isNextStockDemoMode?.()) {
    const expensesGrid = document.getElementById("expensesGrid");
    const emptyMessage = document.getElementById("emptyMessage");

    const searchExpense = document.getElementById("searchExpense");
    const filterDate = document.getElementById("filterDate");
    const filterMinValue = document.getElementById("filterMinValue");

    const btnCreateExpense = document.getElementById("btnCreateExpense");
    const createOptions = document.getElementById("createOptions");
    const btnCreateWritten = document.getElementById("btnCreateWritten");
    const btnCreateUpload = document.getElementById("btnCreateUpload");

    const formOverlay = document.getElementById("formOverlay");
    const formTitle = document.getElementById("formTitle");
    const closeFormModal = document.getElementById("closeFormModal");
    const btnCancelForm = document.getElementById("btnCancelForm");
    const btnSaveExpense = document.getElementById("btnSaveExpense");

    const expenseTotal = document.getElementById("expenseTotal");
    const expenseDate = document.getElementById("expenseDate");
    const expenseEmployee = document.getElementById("expenseEmployee");
    const expenseStore = document.getElementById("expenseStore");

    const writtenSection = document.getElementById("writtenSection");
    const uploadSection = document.getElementById("uploadSection");

    const productName = document.getElementById("productName");
    const productUnits = document.getElementById("productUnits");
    const productCost = document.getElementById("productCost");
    const btnAddProduct = document.getElementById("btnAddProduct");
    const formProductsList = document.getElementById("formProductsList");

    const expenseFiles = document.getElementById("expenseFiles");
    const filePreviewList = document.getElementById("filePreviewList");

    const detailOverlay = document.getElementById("detailOverlay");
    const detailTitle = document.getElementById("detailTitle");
    const detailSummary = document.getElementById("detailSummary");
    const detailWrittenArea = document.getElementById("detailWrittenArea");
    const detailUploadArea = document.getElementById("detailUploadArea");
    const closeDetailModal = document.getElementById("closeDetailModal");
    const closeDetailModal2 = document.getElementById("closeDetailModal2");

    let currentMode = "written";
    let editingId = null;
    let formProducts = [];
    let formFiles = [];
    let carouselIndex = 0;

    const DEMO_EXPENSES = [
      {
        id: 1,
        type: "written",
        total: 245.90,
        date: "2026-04-20",
        employee: "Mariana Souza",
        store: "Mercado Pet Central",
        products: [
          { name: "Papel A4", units: 2, cost: 59.90 },
          { name: "Canetas", units: 10, cost: 36.00 },
          { name: "Material de limpeza", units: 3, cost: 150.00 }
        ],
        files: []
      },
      {
        id: 2,
        type: "upload",
        total: 420.00,
        date: "2026-04-22",
        employee: "Lucas Almeida",
        store: "Distribuidora Norte",
        products: [],
        files: [
          {
            name: "recibo-despesa-01.jpg",
            type: "image",
            url: "https://via.placeholder.com/900x600.png?text=Recibo+01"
          },
          {
            name: "recibo-despesa-02.jpg",
            type: "image",
            url: "https://via.placeholder.com/900x600.png?text=Recibo+02"
          }
        ]
      }
    ];
    let expenses = window.isNextStockDemoMode?.() ? DEMO_EXPENSES : [];

    function formatMoney(value) {
      return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function formatDate(dateString) {
      if (!dateString) return "-";
      const [year, month, day] = dateString.split("-");
      return `${day}/${month}/${year}`;
    }

    function getTypeLabel(type) {
      return type === "written" ? "Nota escrita" : "Nota por upload";
    }

    function getFilteredExpenses() {
      const search = searchExpense.value.trim().toLowerCase();
      const date = filterDate.value;
      const minValue = parseFloat(filterMinValue.value) || 0;

      return expenses.filter(expense => {
        const matchSearch =
          expense.employee.toLowerCase().includes(search) ||
          expense.store.toLowerCase().includes(search);

        const matchDate = !date || expense.date === date;
        const matchValue = expense.total >= minValue;

        return matchSearch && matchDate && matchValue;
      });
    }

    function renderExpenses() {
      const filtered = getFilteredExpenses();

      expensesGrid.innerHTML = "";

      if (!filtered.length) {
        emptyMessage.style.display = "block";
        return;
      }

      emptyMessage.style.display = "none";

      filtered.forEach(expense => {
        const card = document.createElement("div");
        card.className = "expense-card";

        card.innerHTML = `
          <div class="card-top">
            <div class="type-badge ${expense.type}">
              ${getTypeLabel(expense.type)}
            </div>
            <div class="expense-id">#DESP-${String(expense.id).padStart(4, "0")}</div>
          </div>

          <div class="expense-title">${expense.store}</div>

          <div class="expense-info">
            <div class="info-box">
              <span>Valor total da nota</span>
              <strong>${formatMoney(expense.total)}</strong>
            </div>

            <div class="info-box">
              <span>Data da nota</span>
              <strong>${formatDate(expense.date)}</strong>
            </div>

            <div class="info-box">
              <span>Empregado emissor</span>
              <strong>${expense.employee}</strong>
            </div>

            <div class="info-box">
              <span>Loja emissora</span>
              <strong>${expense.store}</strong>
            </div>
          </div>

          <div class="card-actions">
            <button class="btn btn-edit" data-action="edit">Alterar</button>
            <button class="btn btn-delete" data-action="delete">Apagar</button>
          </div>
        `;

        card.addEventListener("click", () => openDetails(expense.id));

        card.querySelector('[data-action="edit"]').addEventListener("click", (e) => {
          e.stopPropagation();
          openEditForm(expense.id);
        });

        card.querySelector('[data-action="delete"]').addEventListener("click", (e) => {
          e.stopPropagation();
          deleteExpense(expense.id);
        });

        expensesGrid.appendChild(card);
      });
    }

    function resetForm() {
      editingId = null;
      expenseTotal.value = "";
      expenseDate.value = "";
      expenseEmployee.value = "";
      expenseStore.value = "";
      productName.value = "";
      productUnits.value = "";
      productCost.value = "";
      expenseFiles.value = "";
      formProducts = [];
      formFiles = [];
      renderFormProducts();
      renderFilePreview();
    }

    function openCreateForm(mode) {
      resetForm();
      currentMode = mode;
      formTitle.textContent = mode === "written" ? "Criar nota escrita de despesa" : "Criar nota por upload";
      writtenSection.style.display = mode === "written" ? "block" : "none";
      uploadSection.style.display = mode === "upload" ? "block" : "none";
      formOverlay.classList.add("active");
      createOptions.classList.remove("active");
    }

    function openEditForm(id) {
      const expense = expenses.find(item => item.id === id);
      if (!expense) return;

      resetForm();

      editingId = id;
      currentMode = expense.type;

      formTitle.textContent = expense.type === "written" ? "Alterar nota escrita" : "Alterar nota por upload";

      expenseTotal.value = expense.total;
      expenseDate.value = expense.date;
      expenseEmployee.value = expense.employee;
      expenseStore.value = expense.store;

      formProducts = JSON.parse(JSON.stringify(expense.products || []));
      formFiles = JSON.parse(JSON.stringify(expense.files || []));

      writtenSection.style.display = expense.type === "written" ? "block" : "none";
      uploadSection.style.display = expense.type === "upload" ? "block" : "none";

      renderFormProducts();
      renderFilePreview();

      formOverlay.classList.add("active");
    }

    function closeForm() {
      formOverlay.classList.remove("active");
      resetForm();
    }

    function addProductToForm() {
      const name = productName.value.trim();
      const units = parseInt(productUnits.value);
      const cost = parseFloat(productCost.value);

      if (!name || !units || !cost) {
        alert("Preencha nome do produto, unidades e custo total.");
        return;
      }

      formProducts.push({ name, units, cost });

      productName.value = "";
      productUnits.value = "";
      productCost.value = "";

      renderFormProducts();
      updateTotalFromProducts();
    }

    function renderFormProducts() {
      const rows = formProducts.map((product, index) => `
        <div class="product-row">
          <div><strong>${product.name}</strong></div>
          <div>${product.units}</div>
          <div>${formatMoney(product.cost)}</div>
          <div>
            <button class="btn-remove-product" data-index="${index}">Remover</button>
          </div>
        </div>
      `).join("");

      formProductsList.innerHTML = `
        <div class="product-row header-row">
          <div>Produto</div>
          <div>Unidades</div>
          <div>Custo total</div>
          <div>Ação</div>
        </div>
        ${rows}
      `;

      formProductsList.querySelectorAll(".btn-remove-product").forEach(button => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.index);
          formProducts.splice(index, 1);
          renderFormProducts();
          updateTotalFromProducts();
        });
      });
    }

    function updateTotalFromProducts() {
      if (currentMode !== "written") return;

      const total = formProducts.reduce((acc, product) => acc + Number(product.cost || 0), 0);
      expenseTotal.value = total.toFixed(2);
    }

    function renderFilePreview() {
      if (!formFiles.length) {
        filePreviewList.innerHTML = "";
        return;
      }

      filePreviewList.innerHTML = formFiles.map((file, index) => `
        <div class="file-preview">
          <span>${file.name}</span>
          <button data-index="${index}">Remover</button>
        </div>
      `).join("");

      filePreviewList.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", () => {
          const index = Number(button.dataset.index);
          formFiles.splice(index, 1);
          renderFilePreview();
        });
      });
    }

    function handleFileUpload(e) {
      const files = Array.from(e.target.files);

      if (formFiles.length + files.length > 5) {
        alert("Cada nota pode ter no máximo 5 arquivos.");
        expenseFiles.value = "";
        return;
      }

      files.forEach(file => {
        const isImage = file.type.startsWith("image/");
        const isPdf = file.type === "application/pdf";
        const isWord =
          file.type === "application/msword" ||
          file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
          file.name.endsWith(".doc") ||
          file.name.endsWith(".docx");

        if (!isImage && !isPdf && !isWord) {
          alert(`Arquivo não aceito: ${file.name}`);
          return;
        }

        formFiles.push({
          name: file.name,
          type: isImage ? "image" : isPdf ? "pdf" : "word",
          url: isImage ? URL.createObjectURL(file) : ""
        });
      });

      expenseFiles.value = "";
      renderFilePreview();
    }

    function saveExpense() {
      const total = parseFloat(expenseTotal.value);
      const date = expenseDate.value;
      const employee = expenseEmployee.value.trim();
      const store = expenseStore.value.trim();

      if (!total || !date || !employee || !store) {
        alert("Preencha valor total, data, empregado emissor e loja emissora.");
        return;
      }

      if (currentMode === "written" && formProducts.length === 0) {
        alert("Adicione pelo menos um produto na nota escrita.");
        return;
      }

      if (currentMode === "upload" && formFiles.length === 0) {
        alert("Adicione pelo menos um arquivo na nota por upload.");
        return;
      }

      const payload = {
        id: editingId || Date.now(),
        type: currentMode,
        total,
        date,
        employee,
        store,
        products: currentMode === "written" ? formProducts : [],
        files: currentMode === "upload" ? formFiles : []
      };

      if (editingId) {
        expenses = expenses.map(item => item.id === editingId ? payload : item);
      } else {
        expenses.unshift(payload);
      }

      closeForm();
      renderExpenses();
    }

    function deleteExpense(id) {
      const confirmDelete = confirm("Deseja apagar esta nota de despesa?");
      if (!confirmDelete) return;

      expenses = expenses.filter(item => item.id !== id);
      renderExpenses();
    }

    function openDetails(id) {
      const expense = expenses.find(item => item.id === id);
      if (!expense) return;

      carouselIndex = 0;

      detailTitle.textContent = `${getTypeLabel(expense.type)} - #DESP-${String(expense.id).padStart(4, "0")}`;

      detailSummary.innerHTML = `
        <div class="summary-card">
          <span>Valor total</span>
          <strong>${formatMoney(expense.total)}</strong>
        </div>

        <div class="summary-card">
          <span>Data</span>
          <strong>${formatDate(expense.date)}</strong>
        </div>

        <div class="summary-card">
          <span>Empregado emissor</span>
          <strong>${expense.employee}</strong>
        </div>

        <div class="summary-card">
          <span>Loja emissora</span>
          <strong>${expense.store}</strong>
        </div>
      `;

      detailWrittenArea.innerHTML = "";
      detailUploadArea.innerHTML = "";

      if (expense.type === "written") {
        detailWrittenArea.innerHTML = `
          <div class="detail-products">
            <div class="detail-products-title">Produtos da nota</div>

            <div class="detail-products-scroll">
              <div class="product-row header-row">
                <div>Produto</div>
                <div>Unidades</div>
                <div>Custo total</div>
                <div></div>
              </div>

              ${expense.products.map(product => `
                <div class="product-row">
                  <div><strong>${product.name}</strong></div>
                  <div>${product.units}</div>
                  <div>${formatMoney(product.cost)}</div>
                  <div></div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }

      if (expense.type === "upload") {
        renderCarousel(expense);
      }

      detailOverlay.classList.add("active");
    }

    function renderCarousel(expense) {
      const files = expense.files || [];
      const currentFile = files[carouselIndex];

      if (!currentFile) {
        detailUploadArea.innerHTML = "";
        return;
      }

      const visual =
        currentFile.type === "image"
          ? `<img src="${currentFile.url}" alt="${currentFile.name}" />`
          : `
            <div class="file-box">
              ${currentFile.type === "pdf" ? "Arquivo PDF" : "Arquivo Word"}
              <small>${currentFile.name}</small>
            </div>
          `;

      detailUploadArea.innerHTML = `
        <div class="carousel">
          <div class="carousel-view">
            ${visual}
          </div>

          <div class="carousel-controls">
            <button id="btnPrevFile">← Back</button>
            <div class="carousel-counter">
              ${carouselIndex + 1} de ${files.length}
            </div>
            <button id="btnNextFile">Next →</button>
          </div>
        </div>
      `;

      document.getElementById("btnPrevFile").addEventListener("click", () => {
        carouselIndex = carouselIndex === 0 ? files.length - 1 : carouselIndex - 1;
        renderCarousel(expense);
      });

      document.getElementById("btnNextFile").addEventListener("click", () => {
        carouselIndex = carouselIndex === files.length - 1 ? 0 : carouselIndex + 1;
        renderCarousel(expense);
      });
    }

    function closeDetails() {
      detailOverlay.classList.remove("active");
    }

    btnCreateExpense.addEventListener("click", () => {
      createOptions.classList.toggle("active");
    });

    btnCreateWritten.addEventListener("click", () => openCreateForm("written"));
    btnCreateUpload.addEventListener("click", () => openCreateForm("upload"));

    closeFormModal.addEventListener("click", closeForm);
    btnCancelForm.addEventListener("click", closeForm);
    btnSaveExpense.addEventListener("click", saveExpense);

    btnAddProduct.addEventListener("click", addProductToForm);
    expenseFiles.addEventListener("change", handleFileUpload);

    closeDetailModal.addEventListener("click", closeDetails);
    closeDetailModal2.addEventListener("click", closeDetails);

    formOverlay.addEventListener("click", (e) => {
      if (e.target === formOverlay) closeForm();
    });

    detailOverlay.addEventListener("click", (e) => {
      if (e.target === detailOverlay) closeDetails();
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".create-wrapper")) {
        createOptions.classList.remove("active");
      }
    });

    searchExpense.addEventListener("input", renderExpenses);
    filterDate.addEventListener("input", renderExpenses);
    filterMinValue.addEventListener("input", renderExpenses);

    renderExpenses();
    }
  
