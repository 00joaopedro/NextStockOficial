(function () {
  const state = {
    suppliers: [],
    selectedId: null,
    selectedBranch: null,
    loading: false,
    searchTimer: null,
  };

  const supplierForm = document.getElementById("supplierForm");
  const supplierList = document.getElementById("supplierList");
  const emptyMessage = document.getElementById("emptyMessage");
  const searchSupplierInput = document.getElementById("searchSupplierInput");
  const btnNovo = document.getElementById("btnNovo");
  const btnApagar = document.getElementById("btnApagar");
  const btnSalvar = document.getElementById("btnSalvar");

  const fields = {
    razaoSocial: document.getElementById("razaoSocial"),
    nomeFantasia: document.getElementById("nomeFantasia"),
    tipoPessoa: document.getElementById("tipoPessoa"),
    cnpjCpf: document.getElementById("cnpjCpf"),
    inscricaoEstadual: document.getElementById("inscricaoEstadual"),
    contatoPrincipal: document.getElementById("contatoPrincipal"),
    telefone: document.getElementById("telefone"),
    whatsapp: document.getElementById("whatsapp"),
    email: document.getElementById("email"),
    site: document.getElementById("site"),
    cep: document.getElementById("cep"),
    cidade: document.getElementById("cidade"),
    estado: document.getElementById("estado"),
    bairro: document.getElementById("bairro"),
    rua: document.getElementById("rua"),
    numero: document.getElementById("numero"),
    complemento: document.getElementById("complemento"),
    prazoEntrega: document.getElementById("prazoEntrega"),
    categoriaProdutos: document.getElementById("categoriaProdutos"),
    formaPagamento: document.getElementById("formaPagamento"),
    statusFornecedor: document.getElementById("statusFornecedor"),
    observacoes: document.getElementById("observacoes"),
  };

  const statusMessage = document.createElement("p");
  statusMessage.className = "empty-message";
  statusMessage.style.marginTop = "10px";
  supplierForm.appendChild(statusMessage);

  function setMessage(message, type) {
    statusMessage.textContent = message || "";
    statusMessage.style.color = type === "error" ? "#b91c1c" : type === "success" ? "#166534" : "#666";
  }

  function setBusy(isBusy) {
    [btnNovo, btnApagar, btnSalvar].forEach((button) => {
      button.disabled = isBusy;
    });
  }

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function toPersonType(value) {
    const normalized = clean(value).toLowerCase();
    if (normalized === "individual" || normalized.includes("f")) {
      return "individual";
    }
    return "company";
  }

  function fromPersonType(value) {
    return value === "individual" ? "Pessoa FÃ­sica" : "Pessoa JurÃ­dica";
  }

  function toStatus(value) {
    const normalized = clean(value).toLowerCase();
    if (normalized === "blocked" || normalized.includes("bloque")) return "blocked";
    if (normalized === "inactive" || normalized.includes("inativo")) return "inactive";
    return "active";
  }

  function fromStatus(value) {
    if (value === "blocked") return "Bloqueado";
    if (value === "inactive") return "Inativo";
    return "Ativo";
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

    if (profileResponse.status === 401 || profileResponse.status === 403) {
      window.location.href = "index.html";
      return false;
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
    state.selectedBranch = context.selectedBranch || context.branch || null;

    if (!state.selectedBranch?.id) {
      throw new Error("Selecione uma filial valida para gerenciar fornecedores.");
    }

    sessionStorage.setItem("nextstockBackendMode", "production");
    sessionStorage.setItem("nextstockSelectedBranch", JSON.stringify(state.selectedBranch));
    sessionStorage.setItem("nextstockBranchId", state.selectedBranch.id);
    sessionStorage.setItem("nextstockTenantId", state.selectedBranch.tenantId || "");

    return true;
  }

  function getQueryString() {
    const params = new URLSearchParams();
    const search = clean(searchSupplierInput.value);

    if (search) params.set("search", search);
    params.set("page", "1");
    params.set("pageSize", "100");

    return params.toString();
  }

  async function carregarFornecedores() {
    state.loading = true;
    renderizarListaFornecedores();

    try {
      const data = await apiFetch(`/api/suppliers?${getQueryString()}`);
      state.suppliers = Array.isArray(data.items) ? data.items : [];
      renderizarListaFornecedores();
    } catch (error) {
      state.suppliers = [];
      renderizarListaFornecedores();
      setMessage(error.message, "error");
    } finally {
      state.loading = false;
      renderizarListaFornecedores();
    }
  }

  function obterDadosFormulario() {
    return {
      legalName: clean(fields.razaoSocial.value),
      tradeName: clean(fields.nomeFantasia.value) || undefined,
      personType: toPersonType(fields.tipoPessoa.value),
      document: clean(fields.cnpjCpf.value),
      stateRegistration: clean(fields.inscricaoEstadual.value) || undefined,
      mainContact: clean(fields.contatoPrincipal.value) || undefined,
      phone: clean(fields.telefone.value),
      whatsapp: clean(fields.whatsapp.value) || undefined,
      email: clean(fields.email.value) || undefined,
      site: clean(fields.site.value) || undefined,
      zipCode: clean(fields.cep.value) || undefined,
      city: clean(fields.cidade.value) || undefined,
      state: clean(fields.estado.value) || undefined,
      district: clean(fields.bairro.value) || undefined,
      street: clean(fields.rua.value) || undefined,
      number: clean(fields.numero.value) || undefined,
      complement: clean(fields.complemento.value) || undefined,
      averageDeliveryTime: clean(fields.prazoEntrega.value) || undefined,
      productCategories: clean(fields.categoriaProdutos.value) || undefined,
      paymentTerms: clean(fields.formaPagamento.value) || undefined,
      status: toStatus(fields.statusFornecedor.value),
      notes: clean(fields.observacoes.value) || undefined,
    };
  }

  function validarFornecedor(dados) {
    if (!dados.legalName) throw new Error("Preencha a Razao Social / Nome do Fornecedor.");
    if (!fields.tipoPessoa.value) throw new Error("Selecione o tipo do fornecedor.");
    if (!dados.document) throw new Error("Preencha o CNPJ ou CPF.");
    if (!dados.phone) throw new Error("Preencha o telefone do fornecedor.");
  }

  function preencherFormulario(supplier) {
    fields.razaoSocial.value = supplier.legalName || "";
    fields.nomeFantasia.value = supplier.tradeName || "";
    fields.tipoPessoa.value = fromPersonType(supplier.personType);
    fields.cnpjCpf.value = supplier.document || "";
    fields.inscricaoEstadual.value = supplier.stateRegistration || "";
    fields.contatoPrincipal.value = supplier.mainContact || "";
    fields.telefone.value = supplier.phone || "";
    fields.whatsapp.value = supplier.whatsapp || "";
    fields.email.value = supplier.email || "";
    fields.site.value = supplier.site || "";
    fields.cep.value = supplier.zipCode || "";
    fields.cidade.value = supplier.city || "";
    fields.estado.value = supplier.state || "";
    fields.bairro.value = supplier.district || "";
    fields.rua.value = supplier.street || "";
    fields.numero.value = supplier.number || "";
    fields.complemento.value = supplier.complement || "";
    fields.prazoEntrega.value = supplier.averageDeliveryTime || "";
    fields.categoriaProdutos.value = supplier.productCategories || "";
    fields.formaPagamento.value = supplier.paymentTerms || "";
    fields.statusFornecedor.value = fromStatus(supplier.status);
    fields.observacoes.value = supplier.notes || "";
  }

  function limparFormulario() {
    supplierForm.reset();
    fields.statusFornecedor.value = "Ativo";
    state.selectedId = null;
    setMessage("");
    renderizarListaFornecedores();
    fields.razaoSocial.focus();
  }

  async function salvarFornecedor() {
    try {
      setBusy(true);
      setMessage("Salvando fornecedor...");
      const dados = obterDadosFormulario();
      validarFornecedor(dados);

      if (state.selectedId) {
        await apiFetch(`/api/suppliers/${state.selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        });
        setMessage("Alteracoes salvas com sucesso.", "success");
      } else {
        const result = await apiFetch("/api/suppliers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(dados),
        });
        state.selectedId = result.supplier?.id || null;
        setMessage("Fornecedor cadastrado com sucesso.", "success");
      }

      await carregarFornecedores();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function apagarFornecedor() {
    if (!state.selectedId) {
      setMessage("Selecione um fornecedor para apagar.", "error");
      return;
    }

    const supplier = state.suppliers.find((item) => item.id === state.selectedId);
    if (!supplier) return;

    if (!confirm(`Deseja realmente apagar o fornecedor "${supplier.legalName}"?`)) {
      return;
    }

    try {
      setBusy(true);
      setMessage("Apagando fornecedor...");
      await apiFetch(`/api/suppliers/${supplier.id}`, { method: "DELETE" });
      limparFormulario();
      setMessage("Fornecedor apagado com sucesso.", "success");
      await carregarFornecedores();
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  }

  function selecionarFornecedor(id) {
    const supplier = state.suppliers.find((item) => item.id === id);
    if (!supplier) return;

    state.selectedId = id;
    preencherFormulario(supplier);
    setMessage("");
    renderizarListaFornecedores();
  }

  function renderizarListaFornecedores() {
    supplierList.innerHTML = "";

    if (state.loading) {
      emptyMessage.style.display = "block";
      emptyMessage.textContent = "Carregando fornecedores...";
      return;
    }

    if (!state.suppliers.length) {
      emptyMessage.style.display = "block";
      emptyMessage.textContent = searchSupplierInput.value.trim()
        ? "Nenhum fornecedor encontrado."
        : "Nenhum fornecedor cadastrado.";
      return;
    }

    emptyMessage.style.display = "none";

    state.suppliers.forEach((supplier) => {
      const li = document.createElement("li");
      const name = document.createElement("div");
      const sub = document.createElement("div");

      name.className = "supplier-item-name";
      sub.className = "supplier-item-sub";
      name.textContent = supplier.legalName || supplier.tradeName || "Fornecedor";
      sub.textContent = `${supplier.document || "Sem documento"} | ${supplier.mainContact || "Sem contato"} | ${supplier.phone || "Sem telefone"}`;

      if (supplier.id === state.selectedId) {
        li.classList.add("active");
      }

      li.appendChild(name);
      li.appendChild(sub);
      li.addEventListener("click", () => selecionarFornecedor(supplier.id));
      supplierList.appendChild(li);
    });
  }

  btnNovo.addEventListener("click", limparFormulario);
  btnApagar.addEventListener("click", apagarFornecedor);
  btnSalvar.addEventListener("click", salvarFornecedor);
  searchSupplierInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      carregarFornecedores();
    }, 300);
  });

  fields.tipoPessoa.addEventListener("change", () => {
    if (toPersonType(fields.tipoPessoa.value) === "individual") {
      fields.inscricaoEstadual.value = "";
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      const ok = await bootstrapContext();
      if (ok) {
        await carregarFornecedores();
        limparFormulario();
      }
    } catch (error) {
      setMessage(error.message, "error");
      emptyMessage.style.display = "block";
      emptyMessage.textContent = "Nao foi possivel carregar fornecedores.";
    }
  });
})();
