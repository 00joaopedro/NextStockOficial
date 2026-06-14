(function () {
  const state = {
    user: null,
    selectedBranch: null,
    mode: "visualizacao",
    preview: true,
    canManage: false,
    machines: [],
    selectedMachineId: null,
    busy: false,
  };

  const planImages = {
    ouro: "img/trofeu-ouro.png",
    esmeralda: "img/trofeu-esmeralda.png",
    diamante: "img/trofeu-diamante.png",
  };

  const elements = {
    pageStatus: document.getElementById("pageStatus"),
    nomeCompleto: document.getElementById("nomeCompleto"),
    profileEmail: document.getElementById("profileEmail"),
    empresa: document.getElementById("empresa"),
    cnpj: document.getElementById("cnpj"),
    email: document.getElementById("email"),
    contato: document.getElementById("contato"),
    saveProfileBtn: document.getElementById("saveProfileBtn"),
    saveCompanyBtn: document.getElementById("saveCompanyBtn"),
    plansGrid: document.getElementById("plansGrid"),
    currentPlanTitle: document.getElementById("currentPlanTitle"),
    currentPlanBadge: document.getElementById("currentPlanBadge"),
    machineList: document.getElementById("machineList"),
    addMachineBtn: document.getElementById("addMachineBtn"),
    saveMachineBtn: document.getElementById("saveMachineBtn"),
    deleteMachineBtn: document.getElementById("deleteMachineBtn"),
    machineName: document.getElementById("machineName"),
    machineProvider: document.getElementById("machineProvider"),
    machineModel: document.getElementById("machineModel"),
    machineFee: document.getElementById("machineFee"),
    machineStatus: document.getElementById("machineStatus"),
  };

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function readSelectedBranch() {
    try {
      return JSON.parse(
        sessionStorage.getItem("nextstockSelectedBranch") || "null",
      );
    } catch {
      return null;
    }
  }

  function hasValidSupportContext(branchId) {
    try {
      const support = JSON.parse(
        sessionStorage.getItem("nextstockDevSupportContext") || "null",
      );
      return support?.branchId === branchId && support?.mode === "support";
    } catch {
      return false;
    }
  }

  function buildHeaders(extra) {
    const headers = {
      Accept: "application/json",
      ...(extra || {}),
    };
    const branchId = state.selectedBranch?.id;

    if (branchId) {
      headers["x-nextstock-branch-id"] = branchId;
    }
    if (branchId && hasValidSupportContext(branchId)) {
      headers["x-nextstock-dev-context"] = "support";
    }

    return headers;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: buildHeaders(options?.headers),
    });
    const text = await response.text();
    let body = {};

    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { message: text };
      }
    }

    if (!response.ok) {
      const message = Array.isArray(body.message)
        ? body.message.join("\n")
        : body.message || body.error || "Nao foi possivel concluir a operacao.";
      const error = new Error(message);
      error.status = response.status;
      error.code = body.code;
      throw error;
    }

    return body;
  }

  function setMessage(message, type) {
    elements.pageStatus.textContent = message || "";
    elements.pageStatus.style.color =
      type === "error"
        ? "#b91c1c"
        : type === "success"
          ? "#166534"
          : "#607D8B";
  }

  function setBusy(value) {
    state.busy = value;
    applyPermissions();
  }

  function applyPermissions() {
    const mutationBlocked = state.preview || state.busy;
    elements.saveProfileBtn.disabled = mutationBlocked;
    elements.saveCompanyBtn.disabled = mutationBlocked || !state.canManage;
    elements.addMachineBtn.disabled = mutationBlocked || !state.canManage;
    elements.saveMachineBtn.disabled = mutationBlocked || !state.canManage;
    elements.deleteMachineBtn.disabled =
      mutationBlocked || !state.canManage || !state.selectedMachineId;

    [elements.empresa, elements.cnpj, elements.email, elements.contato].forEach(
      (input) => {
        input.disabled = !state.canManage || state.preview;
      },
    );

    [
      elements.machineName,
      elements.machineProvider,
      elements.machineModel,
      elements.machineFee,
      elements.machineStatus,
    ].forEach((input) => {
      input.disabled = !state.canManage || state.preview;
    });

    elements.nomeCompleto.disabled = state.preview;
  }

  function formatMoney(cents) {
    return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  }

  function providerLabel(provider) {
    return (
      {
        stone: "Stone",
        pagseguro: "PagSeguro",
        mercado_pago: "Mercado Pago",
        outro: "Outro",
      }[provider] || "Outro"
    );
  }

  function statusLabel(status) {
    return (
      {
        ativa: "Ativa",
        inativa: "Inativa",
        manutencao: "Manutencao",
      }[status] || "Ativa"
    );
  }

  async function bootstrapContext() {
    const authResponse = await fetch("/api/auth/profile", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (authResponse.status === 401 || authResponse.status === 403) {
      window.location.href = "index.html";
      return false;
    }
    if (!authResponse.ok) {
      throw new Error("Nao foi possivel validar a sessao.");
    }

    const auth = await authResponse.json();
    state.user = auth.user || auth.profile || auth;
    state.selectedBranch =
      readSelectedBranch() || auth.selectedBranch || state.user?.branch || null;

    const context = await api("/api/system/context");
    state.selectedBranch =
      context.selectedBranch || context.branch || state.selectedBranch;

    if (!state.selectedBranch?.id) {
      throw new Error("Selecione uma filial valida para continuar.");
    }

    sessionStorage.setItem(
      "nextstockSelectedBranch",
      JSON.stringify(state.selectedBranch),
    );
    sessionStorage.setItem("nextstockBranchId", state.selectedBranch.id);
    sessionStorage.setItem(
      "nextstockTenantId",
      state.selectedBranch.tenantId || "",
    );

    const role = state.user?.role;
    state.canManage =
      role === "Admin" ||
      state.user?.isDevSuperAdmin === true;
    state.preview =
      String(context.systemMode || "").toUpperCase() === "PREVIEW";

    return true;
  }

  async function loadProfile() {
    const data = await api("/api/profile/me");
    elements.nomeCompleto.value = data.profile?.fullName || "";
    elements.profileEmail.value = data.profile?.email || "";
  }

  async function loadCompany() {
    const data = await api("/api/profile/company");
    const company = data.company || {};

    state.mode = data.mode || "visualizacao";
    state.preview = state.preview || state.mode === "visualizacao";
    elements.empresa.value = company.empresa || "";
    elements.cnpj.value = company.cnpj || "";
    elements.email.value = company.email || "";
    elements.contato.value = company.contato || "";
    setCurrentPlan(data.currentPlan);
  }

  async function loadSubscription() {
    const data = await api("/api/profile/subscription");
    setCurrentPlan(data.currentPlan);
  }

  function setCurrentPlan(plan) {
    const name = plan?.name || "Nao contratado";
    elements.currentPlanTitle.textContent = `Plano atual: ${name}`;
    elements.currentPlanBadge.textContent = `Plano atual: ${name}`;
  }

  async function loadPlans() {
    elements.plansGrid.replaceChildren(
      createTextState("Carregando planos..."),
    );

    try {
      const data = await api("/api/profile/plans");
      const plans = Array.isArray(data.plans) ? data.plans : [];
      elements.plansGrid.replaceChildren();

      if (!plans.length) {
        elements.plansGrid.appendChild(
          createTextState("Nenhum plano disponivel."),
        );
        return;
      }

      plans.forEach((plan) => {
        elements.plansGrid.appendChild(createPlanCard(plan));
      });
    } catch (error) {
      elements.plansGrid.replaceChildren(
        createTextState(`Erro ao carregar planos: ${error.message}`, true),
      );
    }
  }

  function createPlanCard(plan) {
    const card = document.createElement("div");
    card.className = "plan-card";

    const image = document.createElement("img");
    image.className = "plan-img";
    image.src = planImages[plan.slug] || planImages.ouro;
    image.alt = `Imagem do plano ${clean(plan.name)}`;

    const content = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = clean(plan.name);
    const description = document.createElement("p");
    description.textContent = clean(plan.description);
    const price = document.createElement("strong");
    price.className = "plan-price";
    price.textContent = formatMoney(plan.priceCents);
    const action = document.createElement("button");
    action.type = "button";
    action.className = "btn btn-add";
    action.textContent = "Solicitar alteracao";
    action.disabled = !state.canManage || state.preview;
    action.addEventListener("click", () => requestPlan(plan.slug));

    content.append(title, description, price, action);
    card.append(image, content);
    return card;
  }

  function createTextState(message, isError) {
    const text = document.createElement("p");
    text.className = "helper-text";
    text.textContent = message;
    if (isError) text.style.color = "#b91c1c";
    return text;
  }

  async function requestPlan(planSlug) {
    setBusy(true);
    try {
      await api("/api/profile/plan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      });
    } catch (error) {
      setMessage(error.message, error.status === 409 ? "info" : "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setMessage("Salvando perfil...", "info");
    try {
      await api("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: clean(elements.nomeCompleto.value) }),
      });
      await loadProfile();
      setMessage("Perfil pessoal salvo.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function saveCompany() {
    setBusy(true);
    setMessage("Salvando empresa...", "info");
    try {
      await api("/api/profile/company", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa: clean(elements.empresa.value),
          cnpj: clean(elements.cnpj.value),
          email: clean(elements.email.value),
          contato: clean(elements.contato.value),
        }),
      });
      await loadCompany();
      setMessage("Dados da empresa salvos.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function loadMachines() {
    elements.machineList.replaceChildren(
      createTextState("Carregando maquininhas..."),
    );

    try {
      const data = await api("/api/payment-machines");
      state.machines = Array.isArray(data.machines) ? data.machines : [];
      state.mode = data.mode || state.mode;
      state.preview = state.preview || state.mode === "visualizacao";
      renderMachines();
    } catch (error) {
      state.machines = [];
      elements.machineList.replaceChildren(
        createTextState(
          `Erro ao carregar maquininhas: ${error.message}`,
          true,
        ),
      );
    } finally {
      applyPermissions();
    }
  }

  function renderMachines() {
    elements.machineList.replaceChildren();

    if (!state.machines.length) {
      elements.machineList.appendChild(
        createTextState("Nenhuma maquininha cadastrada nesta filial."),
      );
      clearMachineForm();
      return;
    }

    state.machines.forEach((machine) => {
      const card = document.createElement("div");
      card.className = "machine-card";
      card.classList.toggle("selected", machine.id === state.selectedMachineId);

      const title = document.createElement("h4");
      title.textContent = `${providerLabel(machine.provider)} - ${clean(machine.name)}`;
      const details = document.createElement("p");
      details.style.whiteSpace = "pre-line";
      details.textContent = [
        `Modelo: ${clean(machine.model)}`,
        `Taxa: ${Number(machine.feePercent || 0).toFixed(2)}%`,
        `Status: ${statusLabel(machine.status)}`,
      ].join("\n");

      card.append(title, details);
      card.addEventListener("click", () => selectMachine(machine.id));
      elements.machineList.appendChild(card);
    });

    if (!state.selectedMachineId) {
      selectMachine(state.machines[0].id);
    }
  }

  function selectMachine(id) {
    const machine = state.machines.find((item) => item.id === id);
    if (!machine) return;

    state.selectedMachineId = id;
    elements.machineName.value = machine.name || "";
    elements.machineProvider.value = machine.provider || "";
    elements.machineModel.value = machine.model || "";
    elements.machineFee.value = machine.feePercent ?? "";
    elements.machineStatus.value = machine.status || "ativa";
    renderMachines();
    applyPermissions();
  }

  function clearMachineForm() {
    state.selectedMachineId = null;
    elements.machineName.value = "";
    elements.machineProvider.value = "";
    elements.machineModel.value = "";
    elements.machineFee.value = "";
    elements.machineStatus.value = "ativa";

    document.querySelectorAll(".machine-card").forEach((card) => {
      card.classList.remove("selected");
    });
    applyPermissions();
  }

  async function saveMachine() {
    const payload = {
      name: clean(elements.machineName.value),
      provider: elements.machineProvider.value,
      model: clean(elements.machineModel.value),
      feePercent: Number(elements.machineFee.value),
      status: elements.machineStatus.value,
    };

    if (!payload.name || !payload.provider || !payload.model) {
      throw new Error("Preencha nome, operadora e modelo da maquininha.");
    }
    if (!Number.isFinite(payload.feePercent)) {
      throw new Error("Informe uma taxa valida.");
    }

    setBusy(true);
    setMessage("Salvando maquininha...", "info");
    try {
      await api(
        state.selectedMachineId
          ? `/api/payment-machines/${state.selectedMachineId}`
          : "/api/payment-machines",
        {
          method: state.selectedMachineId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      clearMachineForm();
      await loadMachines();
      setMessage("Maquininha salva.", "success");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMachine() {
    if (!state.selectedMachineId) return;
    if (
      !window.confirm(
        "Deseja inativar esta maquininha? Ela deixara de aparecer nesta lista.",
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("Inativando maquininha...", "info");
    try {
      await api(`/api/payment-machines/${state.selectedMachineId}`, {
        method: "DELETE",
      });
      clearMachineForm();
      await loadMachines();
      setMessage("Maquininha inativada.", "success");
    } finally {
      setBusy(false);
    }
  }

  function handle(action) {
    return () => {
      action().catch((error) => {
        setMessage(error.message, "error");
        setBusy(false);
      });
    };
  }

  async function initialize() {
    elements.plansGrid.replaceChildren(
      createTextState("Validando acesso..."),
    );
    elements.machineList.replaceChildren(
      createTextState("Validando acesso..."),
    );
    setMessage("Validando sessao e contexto...", "info");

    if (!(await bootstrapContext())) return;

    await Promise.all([
      loadProfile(),
      loadCompany(),
      loadSubscription(),
      loadPlans(),
      loadMachines(),
    ]);
    applyPermissions();
    setMessage(
      state.preview
        ? "Modo visualizacao: alteracoes estao bloqueadas."
        : "Dados carregados.",
      "info",
    );
  }

  elements.saveProfileBtn.addEventListener("click", handle(saveProfile));
  elements.saveCompanyBtn.addEventListener("click", handle(saveCompany));
  elements.addMachineBtn.addEventListener("click", clearMachineForm);
  elements.saveMachineBtn.addEventListener("click", handle(saveMachine));
  elements.deleteMachineBtn.addEventListener("click", handle(deleteMachine));

  initialize().catch((error) => {
    elements.plansGrid.replaceChildren(
      createTextState("Nao foi possivel carregar os planos.", true),
    );
    elements.machineList.replaceChildren(
      createTextState("Nao foi possivel carregar as maquininhas.", true),
    );
    setMessage(error.message, "error");
    applyPermissions();
  });
})();
