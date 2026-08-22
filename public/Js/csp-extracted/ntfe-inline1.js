    if (window.isNextStockDemoMode?.()) {
    const DEMO_CLIENTS = [
      {
        nome: "Ana Paula Ribeiro",
        tipoDoc: "cpf",
        doc: "123.456.789-00",
        ie: "ISENTO",
        indIe: "9",
        email: "ana.ribeiro@email.com",
        telefone: "(11) 98888-1111",
        endereco: "Rua das Flores, 120",
        bairro: "Centro",
        municipio: "São Paulo",
        uf: "SP",
        cep: "01000-000",
        pais: "Brasil"
      },
      {
        nome: "Pet Shop Amigo Fiel LTDA",
        tipoDoc: "cnpj",
        doc: "12.345.678/0001-99",
        ie: "123456789",
        indIe: "1",
        email: "financeiro@amigofiel.com.br",
        telefone: "(21) 3777-2222",
        endereco: "Av. Brasil, 450",
        bairro: "Jardim Pet",
        municipio: "Rio de Janeiro",
        uf: "RJ",
        cep: "20000-000",
        pais: "Brasil"
      },
      {
        nome: "Carlos Henrique Souza",
        tipoDoc: "cpf",
        doc: "987.654.321-00",
        ie: "ISENTO",
        indIe: "9",
        email: "carlos.souza@email.com",
        telefone: "(31) 97777-3333",
        endereco: "Rua Bela Vista, 55",
        bairro: "Savassi",
        municipio: "Belo Horizonte",
        uf: "MG",
        cep: "30000-000",
        pais: "Brasil"
      }
    ];
    const clientsMock = window.isNextStockDemoMode?.() ? DEMO_CLIENTS : [];

    const searchInput = document.getElementById("searchClient");
    const autocompleteList = document.getElementById("autocompleteList");
    const itemsList = document.getElementById("itemsList");
    const btnAddItem = document.getElementById("btnAddItem");
    const btnNovo = document.getElementById("btnNovo");
    const btnEnviar = document.getElementById("btnEnviar");

    const moneyFields = {
      totalProdutos: document.getElementById("totalProdutos"),
      totalDesconto: document.getElementById("totalDesconto"),
      totalFrete: document.getElementById("totalFrete"),
      valorNota: document.getElementById("valorNota")
    };

    function formatBRL(value) {
      return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      });
    }

    function fillClientData(client) {
      document.getElementById("destNome").value = client.nome || "";
      document.getElementById("destTipoDoc").value = client.tipoDoc || "cpf";
      document.getElementById("destDoc").value = client.doc || "";
      document.getElementById("destIe").value = client.ie || "";
      document.getElementById("destIndIe").value = client.indIe || "9";
      document.getElementById("destEmail").value = client.email || "";
      document.getElementById("destTelefone").value = client.telefone || "";
      document.getElementById("destEndereco").value = client.endereco || "";
      document.getElementById("destBairro").value = client.bairro || "";
      document.getElementById("destMunicipio").value = client.municipio || "";
      document.getElementById("destUf").value = client.uf || "";
      document.getElementById("destCep").value = client.cep || "";
      document.getElementById("destPais").value = client.pais || "Brasil";
    }

    function renderAutocomplete(filteredClients) {
      if (!filteredClients.length) {
        autocompleteList.style.display = "none";
        autocompleteList.innerHTML = "";
        return;
      }

      autocompleteList.innerHTML = filteredClients.map((client, index) => `
        <div class="autocomplete-item" data-index="${index}">
          <strong>${client.nome}</strong>
          <span>${client.doc} • ${client.email} • ${client.telefone}</span>
        </div>
      `).join("");

      autocompleteList.style.display = "block";

      const items = autocompleteList.querySelectorAll(".autocomplete-item");
      items.forEach((item) => {
        item.addEventListener("click", () => {
          const selectedName = item.querySelector("strong").textContent;
          const client = filteredClients.find(c => c.nome === selectedName);
          if (client) {
            fillClientData(client);
            searchInput.value = client.nome;
            autocompleteList.style.display = "none";
          }
        });
      });
    }

    searchInput.addEventListener("input", () => {
      const term = searchInput.value.trim().toLowerCase();

      if (!term) {
        autocompleteList.style.display = "none";
        autocompleteList.innerHTML = "";
        return;
      }

      const filtered = clientsMock.filter(client =>
        client.nome.toLowerCase().includes(term) ||
        client.doc.toLowerCase().includes(term) ||
        client.email.toLowerCase().includes(term) ||
        client.telefone.toLowerCase().includes(term)
      );

      renderAutocomplete(filtered);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-area")) {
        autocompleteList.style.display = "none";
      }
    });

    function createItemCard(data = {}) {
      const item = document.createElement("div");
      item.className = "item-card";

      item.innerHTML = `
        <div class="item-top">
          <h4>Item da nota</h4>
          <button type="button" class="btn-remove-item">Remover</button>
        </div>

        <div class="fields">
          <div class="field span-4">
            <label>Descrição do produto</label>
            <input type="text" class="item-descricao" placeholder="Nome do produto" value="${data.descricao || ""}" />
          </div>

          <div class="field span-2">
            <label>Código interno</label>
            <input type="text" class="item-codigo" placeholder="SKU" value="${data.codigo || ""}" />
          </div>

          <div class="field span-2">
            <label>NCM</label>
            <input type="text" class="item-ncm" placeholder="00000000" value="${data.ncm || ""}" />
          </div>

          <div class="field span-2">
            <label>CFOP</label>
            <input type="text" class="item-cfop" placeholder="5102" value="${data.cfop || ""}" />
          </div>

          <div class="field span-2">
            <label>Unidade</label>
            <input type="text" class="item-unidade" placeholder="UN" value="${data.unidade || "UN"}" />
          </div>

          <div class="field span-2">
            <label>Quantidade</label>
            <input type="number" class="item-quantidade" min="0" step="0.001" placeholder="1" value="${data.quantidade || "1"}" />
          </div>

          <div class="field span-2">
            <label>Valor unitário</label>
            <input type="number" class="item-unitario" min="0" step="0.01" placeholder="0.00" value="${data.unitario || "0"}" />
          </div>

          <div class="field span-2">
            <label>Desconto</label>
            <input type="number" class="item-desconto" min="0" step="0.01" placeholder="0.00" value="${data.desconto || "0"}" />
          </div>

          <div class="field span-2">
            <label>Alíquota ICMS (%)</label>
            <input type="number" class="item-icms" min="0" step="0.01" placeholder="0.00" value="${data.icms || "0"}" />
          </div>

          <div class="field span-2">
            <label>Alíquota IPI (%)</label>
            <input type="number" class="item-ipi" min="0" step="0.01" placeholder="0.00" value="${data.ipi || "0"}" />
          </div>

          <div class="field span-2">
            <label>Alíquota PIS (%)</label>
            <input type="number" class="item-pis" min="0" step="0.01" placeholder="0.00" value="${data.pis || "0"}" />
          </div>

          <div class="field span-2">
            <label>Alíquota COFINS (%)</label>
            <input type="number" class="item-cofins" min="0" step="0.01" placeholder="0.00" value="${data.cofins || "0"}" />
          </div>
        </div>
      `;

      const removeBtn = item.querySelector(".btn-remove-item");
      removeBtn.addEventListener("click", () => {
        item.remove();
        updateTotals();
      });

      const inputs = item.querySelectorAll("input");
      inputs.forEach(input => input.addEventListener("input", updateTotals));

      itemsList.appendChild(item);
      updateTotals();
    }

    function updateTotals() {
      const itemCards = document.querySelectorAll(".item-card");
      let totalProdutos = 0;
      let totalDesconto = 0;

      itemCards.forEach(card => {
        const qtd = parseFloat(card.querySelector(".item-quantidade").value) || 0;
        const unit = parseFloat(card.querySelector(".item-unitario").value) || 0;
        const desc = parseFloat(card.querySelector(".item-desconto").value) || 0;

        totalProdutos += qtd * unit;
        totalDesconto += desc;
      });

      const frete = parseFloat(document.getElementById("frete").value) || 0;
      const totalNota = totalProdutos - totalDesconto + frete;

      moneyFields.totalProdutos.textContent = formatBRL(totalProdutos);
      moneyFields.totalDesconto.textContent = formatBRL(totalDesconto);
      moneyFields.totalFrete.textContent = formatBRL(frete);
      moneyFields.valorNota.textContent = formatBRL(totalNota);

      document.getElementById("valorPago").value = totalNota > 0 ? totalNota.toFixed(2) : "";
    }

    btnAddItem.addEventListener("click", () => createItemCard());

    document.getElementById("frete").addEventListener("input", updateTotals);

    function resetForm() {
      document.querySelectorAll("input, textarea").forEach(el => {
        if (!el.hasAttribute("readonly")) el.value = "";
      });

      document.querySelectorAll("select").forEach(select => {
        select.selectedIndex = 0;
      });

      itemsList.innerHTML = "";
      autocompleteList.style.display = "none";
      document.getElementById("destPais").value = "Brasil";
      document.getElementById("dataEmissao").value = new Date().toISOString().slice(0,16);
      createItemCard();
      updateTotals();
    }

    btnNovo.addEventListener("click", resetForm);

    btnEnviar.addEventListener("click", () => {
      alert("Frontend pronto: aqui futuramente será integrada a API/rotina de envio para a SEFAZ e depois o redirecionamento para a página de notas.");
    });

    function getSelectedBranch() {
      try {
        return JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null");
      } catch {
        return null;
      }
    }

    function buildApiHeaders() {
      const headers = { "Content-Type": "application/json" };
      const branch = getSelectedBranch();
      if (branch?.id) headers["x-nextstock-branch-id"] = branch.id;

      try {
        const supportContext = JSON.parse(sessionStorage.getItem("nextstockDevSupportContext") || "null");
        if (supportContext?.branchId && supportContext.branchId === branch?.id) {
          headers["x-nextstock-dev-context"] = "support";
        }
      } catch {
        // Backend validates the context.
      }

      return headers;
    }

    async function loadOrderDraft(orderId) {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/nfe-draft`, {
        credentials: "include",
        headers: buildApiHeaders()
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Nao foi possivel carregar o pedido para NF-e.");
      }

      fillClientData({
        nome: data.customer?.name,
        doc: data.customer?.document,
        email: data.customer?.email,
        telefone: data.customer?.phone,
        pais: "Brasil"
      });
      itemsList.innerHTML = "";
      (data.items || []).forEach((item) => createItemCard({
        descricao: item.descricao,
        codigo: item.codigo,
        cfop: "5102",
        unidade: "UN",
        quantidade: item.quantidade,
        unitario: item.unitario,
        desconto: "0"
      }));
      updateTotals();
    }

    document.getElementById("dataEmissao").value = new Date().toISOString().slice(0,16);
    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (orderId) {
      loadOrderDraft(orderId).catch((error) => {
        alert(error.message || "Nao foi possivel carregar dados reais do pedido.");
        createItemCard();
      });
    } else if (window.isNextStockDemoMode?.()) {
      createItemCard({
      descricao: "Ração Premium 10kg",
      codigo: "RAC001",
      ncm: "23091000",
      cfop: "5102",
      unidade: "UN",
      quantidade: "1",
      unitario: "189.90",
      desconto: "0",
      icms: "18",
      ipi: "0",
      pis: "1.65",
      cofins: "7.60"
    });
    } else {
      createItemCard();
    }
    }
  
