(function () {
  const state = {
    employees: [],
    selectedId: null,
    selectedBranch: null,
    loading: false,
    searchTimer: null,
    preview: false,
  };

  const form = document.getElementById("employeeForm");
  const fullNameInput = document.getElementById("nomeCompleto");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("senhaAcesso");
  const roleInput = document.getElementById("role");
  const jobTitleInput = document.getElementById("cargo");
  const birthDateInput = document.getElementById("nascimento");
  const admissionDateInput = document.getElementById("admissao");
  const dismissalDateInput = document.getElementById("demissao");
  const statusInput = document.getElementById("statusFuncionario");
  const employeeList = document.getElementById("employeeList");
  const emptyMessage = document.getElementById("emptyMessage");
  const searchInput = document.getElementById("searchEmployeeInput");
  const statusMessage = document.getElementById("statusMessage");

  function setMessage(message, type) {
    statusMessage.textContent = message || "";
    statusMessage.className = `status-message${type ? ` ${type}` : ""}`;
  }

  function formatDateForInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().slice(0, 10);
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
      throw new Error("Usuario sem permissao para acessar funcionarios.");
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
      throw new Error("Selecione uma filial valida para gerenciar funcionarios.");
    }

    sessionStorage.setItem("nextstockSelectedBranch", JSON.stringify(state.selectedBranch));
    sessionStorage.setItem("nextstockBranchId", state.selectedBranch.id);
    sessionStorage.setItem("nextstockTenantId", state.selectedBranch.tenantId || "");

    return true;
  }

  function getQueryString() {
    const params = new URLSearchParams();
    const search = searchInput.value.trim();

    if (search) params.set("search", search);
    params.set("page", "1");
    params.set("pageSize", "100");

    return params.toString();
  }

  async function carregarFuncionarios() {
    state.loading = true;
    renderList();

    try {
      const data = await apiFetch(`/api/employees?${getQueryString()}`);
      state.employees = Array.isArray(data.items) ? data.items : [];
      renderList();
    } catch (error) {
      state.employees = [];
      renderList();
      setMessage(error.message, "error");
    } finally {
      state.loading = false;
      renderList();
    }
  }

  function renderList() {
    employeeList.innerHTML = "";

    if (state.loading) {
      emptyMessage.style.display = "block";
      emptyMessage.textContent = "Carregando funcionarios...";
      return;
    }

    if (state.employees.length === 0) {
      emptyMessage.style.display = "block";
      emptyMessage.textContent = searchInput.value.trim()
        ? "Nenhum funcionario encontrado."
        : "Nenhum funcionario cadastrado.";
      return;
    }

    emptyMessage.style.display = "none";

    state.employees.forEach((employee) => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const meta = document.createElement("span");

      name.className = "employee-name";
      meta.className = "employee-meta";
      name.textContent = employee.fullName || employee.email;
      meta.textContent = `${employee.email || ""} - ${employee.employeeRole || ""} - ${employee.status || ""}`;

      item.appendChild(name);
      item.appendChild(meta);
      item.onclick = () => selecionarFuncionario(employee.id);

      if (state.selectedId === employee.id) {
        item.classList.add("active");
      }

      employeeList.appendChild(item);
    });
  }

  function selectedEmployee() {
    return state.employees.find((employee) => employee.id === state.selectedId) || null;
  }

  function collectCreatePayload() {
    return {
      fullName: fullNameInput.value.trim(),
      email: emailInput.value.trim().toLowerCase(),
      password: passwordInput.value,
      employeeRole: roleInput.value,
      jobTitle: jobTitleInput.value.trim(),
      birthDate: birthDateInput.value || undefined,
      admissionDate: admissionDateInput.value || undefined,
      dismissalDate: dismissalDateInput.value || undefined,
    };
  }

  function collectUpdatePayload() {
    return {
      fullName: fullNameInput.value.trim(),
      employeeRole: roleInput.value,
      jobTitle: jobTitleInput.value.trim(),
      birthDate: birthDateInput.value || null,
      admissionDate: admissionDateInput.value || null,
      dismissalDate: dismissalDateInput.value || null,
      status: statusInput.value,
    };
  }

  function validateCreate(payload) {
    if (!payload.fullName || !payload.email || !payload.password || !payload.employeeRole || !payload.jobTitle) {
      throw new Error("Preencha nome, e-mail, senha, cargo de acesso e cargo.");
    }

    if (payload.password.length < 8) {
      throw new Error("A senha deve ter pelo menos 8 caracteres.");
    }
  }

  function validateUpdate(payload) {
    if (!payload.fullName || !payload.employeeRole || !payload.jobTitle) {
      throw new Error("Preencha nome, cargo de acesso e cargo.");
    }
  }

  async function cadastrarFuncionario() {
    try {
      setMessage("Cadastrando funcionario...");
      const payload = collectCreatePayload();
      validateCreate(payload);
      await apiFetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMessage("Funcionario cadastrado com sucesso.", "success");
      limparFormulario();
      await carregarFuncionarios();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function atualizarFuncionario() {
    const employee = selectedEmployee();

    if (!employee) {
      setMessage("Selecione um funcionario para atualizar.", "error");
      return;
    }

    try {
      setMessage("Atualizando funcionario...");
      const payload = collectUpdatePayload();
      validateUpdate(payload);
      await apiFetch(`/api/employees/${employee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      passwordInput.value = "";
      setMessage("Funcionario atualizado com sucesso.", "success");
      await carregarFuncionarios();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function deletarFuncionario() {
    const employee = selectedEmployee();

    if (!employee) {
      setMessage("Selecione um funcionario para desativar.", "error");
      return;
    }

    if (!confirm("Deseja realmente desativar este funcionario?")) {
      return;
    }

    try {
      setMessage("Desativando funcionario...");
      await apiFetch(`/api/employees/${employee.id}`, { method: "DELETE" });
      limparFormulario();
      setMessage("Funcionario desativado com sucesso.", "success");
      await carregarFuncionarios();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  async function resetarSenhaFuncionario() {
    const employee = selectedEmployee();

    if (!employee) {
      setMessage("Selecione um funcionario para resetar a senha.", "error");
      return;
    }

    const password = passwordInput.value;

    if (!password || password.length < 8) {
      setMessage("Digite uma nova senha com pelo menos 8 caracteres.", "error");
      return;
    }

    try {
      setMessage("Atualizando senha...");
      await apiFetch(`/api/employees/${employee.id}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      passwordInput.value = "";
      setMessage("Senha atualizada com sucesso.", "success");
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  function selecionarFuncionario(id) {
    const employee = state.employees.find((item) => item.id === id);
    if (!employee) return;

    state.selectedId = id;
    fullNameInput.value = employee.fullName || "";
    emailInput.value = employee.email || "";
    emailInput.disabled = true;
    passwordInput.value = "";
    roleInput.value = employee.employeeRole || "";
    jobTitleInput.value = employee.jobTitle || "";
    birthDateInput.value = formatDateForInput(employee.birthDate);
    admissionDateInput.value = formatDateForInput(employee.admissionDate);
    dismissalDateInput.value = formatDateForInput(employee.dismissalDate);
    statusInput.value = employee.status || "active";
    setMessage("");
    renderList();
  }

  function limparFormulario() {
    form.reset();
    state.selectedId = null;
    emailInput.disabled = false;
    statusInput.value = "active";
    setMessage("");
    renderList();
  }

  searchInput.addEventListener("input", () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => {
      carregarFuncionarios();
    }, 300);
  });

  window.cadastrarFuncionario = cadastrarFuncionario;
  window.atualizarFuncionario = atualizarFuncionario;
  window.deletarFuncionario = deletarFuncionario;
  window.resetarSenhaFuncionario = resetarSenhaFuncionario;
  window.limparFormulario = limparFormulario;

  document.addEventListener("DOMContentLoaded", async () => {
    if (window.isNextStockDemoMode?.()) {
      setMessage("Modo visualizacao: dados demonstrativos indisponiveis e alteracoes bloqueadas.");
      emptyMessage.style.display = "block";
      emptyMessage.textContent = "Visualizacao publica de funcionarios.";
      return;
    }
    try {
      const ok = await bootstrapContext();
      if (ok) {
        await carregarFuncionarios();
      }
    } catch (error) {
      setMessage(error.message, "error");
      emptyMessage.style.display = "block";
      emptyMessage.textContent = "Nao foi possivel carregar funcionarios.";
    }
  });
})();
