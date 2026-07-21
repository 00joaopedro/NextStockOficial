(function () {
  const state = {
    user: null,
    selectedBranch: null,
    canManage: false,
    preview: false,
    machines: [],
    selectedMachineId: null,
    busy: false,
  };
  const $ = (id) => document.getElementById(id);
  const el = {
    status: $("pageStatus"), name: $("nomeCompleto"), profileEmail: $("profileEmail"),
    company: $("empresa"), cnpj: $("cnpj"), email: $("email"), contact: $("contato"),
    saveProfile: $("saveProfileBtn"), saveCompany: $("saveCompanyBtn"),
    currentPlan: $("currentPlanTitle"), currentBadge: $("currentPlanBadge"),
    details: $("subscriptionDetails"), plans: $("plansGrid"),
    machineList: $("machineList"), addMachine: $("addMachineBtn"),
    saveMachine: $("saveMachineBtn"), deleteMachine: $("deleteMachineBtn"),
    machineName: $("machineName"), machineProvider: $("machineProvider"),
    machineModel: $("machineModel"), machineFee: $("machineFee"),
    machineStatus: $("machineStatus"),
  };
  const planImages = {
    ouro: "img/trofeu-ouro.png",
    esmeralda: "img/trofeu-esmeralda.png",
    diamante: "img/trofeu-diamante.png",
  };

  function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function selectedBranch() {
    try { return JSON.parse(sessionStorage.getItem("nextstockSelectedBranch") || "null"); }
    catch { return null; }
  }
  function headers(extra) {
    const output = { Accept: "application/json", ...(extra || {}) };
    if (state.selectedBranch?.id) output["x-nextstock-branch-id"] = state.selectedBranch.id;
    try {
      const support = JSON.parse(sessionStorage.getItem("nextstockDevSupportContext") || "null");
      if (support?.branchId === state.selectedBranch?.id && support?.mode === "support") {
        output["x-nextstock-dev-context"] = "support";
      }
    } catch {}
    return output;
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: "include", ...options,
      headers: headers({ ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }),
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.clearNextStockSessionState?.();
      location.href = "index.html";
      throw new Error("Sessão expirada.");
    }
    if (!response.ok) {
      const error = new Error(Array.isArray(body.message) ? body.message.join(" ") : body.message || "Não foi possível concluir.");
      error.status = response.status; error.code = body.code; throw error;
    }
    return body;
  }
  function message(text, type = "") { el.status.textContent = text; el.status.className = `status ${type}`; }
  function money(cents, currency = "BRL") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(cents || 0) / 100);
  }
  function date(value) { return value ? new Date(value).toLocaleString("pt-BR") : "—"; }
  function busy(value) { state.busy = value; permissions(); }
  function permissions() {
    const blocked = state.busy || state.preview;
    el.saveProfile.disabled = blocked;
    el.saveCompany.disabled = blocked || !state.canManage;
    el.addMachine.disabled = blocked || !state.canManage;
    el.saveMachine.disabled = blocked || !state.canManage;
    el.deleteMachine.disabled = blocked || !state.canManage || !state.selectedMachineId;
  }

  async function bootstrap() {
    const auth = await api("/api/auth/profile");
    state.user = auth.user;
    state.selectedBranch = selectedBranch() || auth.selectedBranch || state.user?.branch;
    const context = await api("/api/system/context");
    window.setNextStockBackendContext?.(context);
    state.selectedBranch = context.selectedBranch || state.selectedBranch;
    if (!state.selectedBranch?.id) throw new Error("Selecione uma filial válida.");
    state.canManage = state.user?.role === "Admin" || state.user?.isDevSuperAdmin === true;
    state.preview = String(context.systemMode).toUpperCase() === "PREVIEW";
  }
  async function loadProfile() {
    const data = await api("/api/profile/me");
    el.name.value = data.profile?.fullName || "";
    el.profileEmail.value = data.profile?.email || "";
  }
  async function loadCompany() {
    const data = await api("/api/profile/company");
    el.company.value = data.company?.empresa || "";
    el.cnpj.value = data.company?.cnpj || "";
    el.email.value = data.company?.email || "";
    el.contact.value = data.company?.contato || "";
  }
  async function loadBilling() {
    const data = await api("/api/billing/subscription");
    const subscription = data.subscription;
    const entitlement = data.entitlement || {};
    const plan = subscription?.plan;
    el.currentPlan.textContent = plan ? `Plano atual: ${plan.name}` : "Período gratuito";
    el.currentBadge.textContent = subscription?.status || entitlement.reason || "Sem assinatura";
    const details = [];
    if (subscription?.trialEndsAt) details.push(`Trial termina em ${date(subscription.trialEndsAt)} (${data.trialDaysRemaining || 0} dia(s) restante(s)).`);
    if (subscription?.currentPeriodEndsAt) details.push(`Período pago até ${date(subscription.currentPeriodEndsAt)}.`);
    if (!entitlement.allowed) details.push("Seu período gratuito terminou. Escolha um plano para continuar usando o sistema.");
    el.details.textContent = details.join(" ");
  }
  async function loadPlans() {
    const data = await api("/api/billing/plans");
    el.plans.replaceChildren();
    for (const plan of data.plans || []) {
      const card = document.createElement("article"); card.className = "plan";
      const image = document.createElement("img"); image.src = planImages[plan.slug] || planImages.ouro; image.alt = plan.name;
      const title = document.createElement("strong"); title.textContent = plan.name;
      const description = document.createElement("span"); description.textContent = plan.description || "";
      const price = document.createElement("span"); price.className = "price"; price.textContent = money(plan.priceCents, plan.currency);
      const action = document.createElement("button"); action.textContent = "Escolher plano";
      action.disabled = state.preview || !state.canManage || !plan.checkoutAvailable;
      if (state.preview) action.title = "Modo visualização: ação bloqueada.";
      action.addEventListener("click", () => startCheckout(plan.slug));
      card.append(image, title, description, price, action); el.plans.appendChild(card);
    }
  }
  async function startCheckout(planSlug) {
    busy(true); message("Criando checkout...");
    try {
      const checkout = await api("/api/billing/checkout", {
        method: "POST", body: JSON.stringify({ planSlug }),
      });
      sessionStorage.setItem("nextstockBillingCheckoutId", checkout.checkoutId);
      location.assign(checkout.checkoutUrl);
    } finally { busy(false); }
  }
  async function pollCheckout() {
    const checkoutId = sessionStorage.getItem("nextstockBillingCheckoutId");
    if (!checkoutId) return;
    const result = await api(`/api/billing/checkout/${encodeURIComponent(checkoutId)}/status`);
    if (result.status === "COMPLETED") {
      sessionStorage.removeItem("nextstockBillingCheckoutId");
      message("Pagamento confirmado. Seu acesso foi liberado.", "success");
      await loadBilling();
    } else {
      message("Pagamento aguardando confirmação segura do gateway. O retorno do checkout não libera acesso.");
    }
  }
  async function saveProfile() {
    busy(true);
    try { await api("/api/profile/me", { method: "PATCH", body: JSON.stringify({ fullName: clean(el.name.value) }) }); message("Perfil salvo.", "success"); }
    finally { busy(false); }
  }
  async function saveCompany() {
    busy(true);
    try {
      await api("/api/profile/company", { method: "PATCH", body: JSON.stringify({
        empresa: clean(el.company.value), cnpj: clean(el.cnpj.value),
        email: clean(el.email.value), contato: clean(el.contact.value),
      }) });
      message("Empresa salva.", "success");
    } finally { busy(false); }
  }
  async function loadMachines() {
    try {
      const data = await api("/api/payment-machines");
      state.machines = data.machines || []; renderMachines();
    } catch (error) {
      if (error.status === 402) el.machineList.textContent = "Maquininhas ficam indisponíveis até a assinatura ser regularizada.";
      else throw error;
    }
  }
  function renderMachines() {
    el.machineList.replaceChildren();
    if (!state.machines.length) { el.machineList.textContent = "Nenhuma maquininha cadastrada."; return; }
    for (const machine of state.machines) {
      const card = document.createElement("article"); card.className = `machine${machine.id === state.selectedMachineId ? " selected" : ""}`;
      card.textContent = `${machine.name} · ${machine.model} · ${machine.status}`;
      card.addEventListener("click", () => selectMachine(machine)); el.machineList.appendChild(card);
    }
  }
  function selectMachine(machine) {
    state.selectedMachineId = machine.id; el.machineName.value = machine.name || "";
    el.machineProvider.value = machine.provider || ""; el.machineModel.value = machine.model || "";
    el.machineFee.value = machine.feePercent ?? ""; el.machineStatus.value = machine.status || "ativa";
    renderMachines(); permissions();
  }
  function clearMachine() {
    state.selectedMachineId = null; el.machineName.value = ""; el.machineProvider.value = "";
    el.machineModel.value = ""; el.machineFee.value = ""; el.machineStatus.value = "ativa";
    renderMachines(); permissions();
  }
  async function saveMachine() {
    const body = { name: clean(el.machineName.value), provider: el.machineProvider.value,
      model: clean(el.machineModel.value), feePercent: Number(el.machineFee.value), status: el.machineStatus.value };
    busy(true);
    try {
      await api(state.selectedMachineId ? `/api/payment-machines/${state.selectedMachineId}` : "/api/payment-machines",
        { method: state.selectedMachineId ? "PATCH" : "POST", body: JSON.stringify(body) });
      clearMachine(); await loadMachines(); message("Maquininha salva.", "success");
    } finally { busy(false); }
  }
  async function deleteMachine() {
    if (!state.selectedMachineId || !confirm("Inativar esta maquininha?")) return;
    busy(true);
    try { await api(`/api/payment-machines/${state.selectedMachineId}`, { method: "DELETE" }); clearMachine(); await loadMachines(); }
    finally { busy(false); }
  }
  function run(action) { return () => action().catch((error) => { message(error.message, "error"); busy(false); }); }
  el.saveProfile.addEventListener("click", run(saveProfile)); el.saveCompany.addEventListener("click", run(saveCompany));
  el.addMachine.addEventListener("click", clearMachine); el.saveMachine.addEventListener("click", run(saveMachine));
  el.deleteMachine.addEventListener("click", run(deleteMachine));
  (async () => {
    if (window.isNextStockDemoMode?.()) {
      state.preview = true;
      message("Modo visualizacao: perfil, assinatura e pagamentos sao somente demonstrativos.");
      permissions();
      return;
    }
    try {
      await bootstrap();
      await Promise.all([loadProfile(), loadCompany(), loadBilling(), loadPlans(), loadMachines()]);
      permissions();
      const returned = new URLSearchParams(location.search).has("billingReturn");
      if (returned || sessionStorage.getItem("nextstockBillingCheckoutId")) await pollCheckout();
      else message(state.preview ? "Modo visualização." : "Dados carregados.");
    } catch (error) { message(error.message, "error"); permissions(); }
  })();
})();
