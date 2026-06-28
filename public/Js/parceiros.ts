type LinkStatus = "ACTIVE" | "INACTIVE" | "REVOKED";
type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED" | "CANCELED";
type SystemType = "padrao" | "petshop";

interface Partner {
  id: string;
  name: string;
  phone: string;
  bankNumber: string;
  sellerLink: string;
  linkStatus: LinkStatus;
  systemType: SystemType;
  referralCount: number;
  paidReferralCount?: number;
  createdAt: string;
}

interface Referral {
  id: string;
  email: string;
  companyName: string;
  registeredAt: string;
  systemType: SystemType;
  paymentStatus: PaymentStatus;
  seen: boolean;
}

interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

const byId = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const els = {
  gate: byId<HTMLDivElement>("accessGate"),
  status: byId<HTMLDivElement>("statusBox"),
  form: byId<HTMLFormElement>("partnerForm"),
  formTitle: byId<HTMLElement>("formTitle"),
  id: byId<HTMLInputElement>("partnerId"),
  name: byId<HTMLInputElement>("partnerName"),
  phone: byId<HTMLInputElement>("partnerPhone"),
  bankNumber: byId<HTMLInputElement>("partnerBankNumber"),
  systemType: byId<HTMLSelectElement>("partnerSystemType"),
  link: byId<HTMLInputElement>("partnerLink"),
  partnerList: byId<HTMLDivElement>("partnerList"),
  partnerEmpty: byId<HTMLDivElement>("partnerEmpty"),
  partnerSearch: byId<HTMLInputElement>("partnerSearchInput"),
  linkStatus: byId<HTMLSelectElement>("linkStatusFilter"),
  referralsBody: byId<HTMLTableSectionElement>("referralsBody"),
  referralsEmpty: byId<HTMLDivElement>("referralsEmpty"),
  referralSearch: byId<HTMLInputElement>("referralSearchInput"),
  paymentFilter: byId<HTMLSelectElement>("paymentFilter"),
  seenFilter: byId<HTMLSelectElement>("seenFilter"),
  selectedName: byId<HTMLElement>("selectedPartnerName"),
  selectedInfo: byId<HTMLElement>("selectedPartnerInfo"),
  partnersPage: byId<HTMLElement>("partnersPage"),
  referralsPage: byId<HTMLElement>("referralsPage"),
  totalPartners: byId<HTMLElement>("totalPartners"),
  activeLinks: byId<HTMLElement>("activeLinks"),
  totalReferredUsers: byId<HTMLElement>("totalReferredUsers"),
  paidUsers: byId<HTMLElement>("paidUsers"),
};

const state = {
  partners: [] as Partner[],
  selected: null as Partner | null,
  partnerPage: 1,
  partnerTotalPages: 1,
  referralPage: 1,
  referralTotalPages: 1,
  busy: false,
  searchTimer: 0,
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: "include",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));

  if (response.status === 401) {
    (window as any).clearNextStockSessionState?.();
    window.location.href = "index.html";
    throw new Error("Sessão expirada.");
  }
  if (!response.ok) {
    const fallback: Record<number, string> = {
      403: "Acesso restrito ao Dev SuperAdmin.",
      404: "Registro não encontrado.",
      409: "Conflito ao salvar. Atualize a página.",
      422: "Dados inválidos.",
      429: "Muitas tentativas. Aguarde e tente novamente.",
      500: "Erro interno. Tente novamente.",
    };
    const message = Array.isArray(body.message)
      ? body.message.join(" ")
      : body.message || fallback[response.status] || "Não foi possível concluir.";
    throw new Error(message);
  }
  return body as T;
}

function isDevSuperAdmin(user: any) {
  return (
    user?.isDevSuperAdmin === true &&
    (user?.role === "superAdmin" ||
      user?.roles?.includes?.("superAdmin") === true ||
      user?.isSuperAdmin === true ||
      user?.is_super_admin === true)
  );
}

async function bootstrap() {
  try {
    const profile = await api<{ user: unknown }>("/auth/profile");
    if (!isDevSuperAdmin(profile.user)) {
      document.body.dataset.locked = "true";
      els.gate.innerHTML =
        "<h2>Acesso restrito</h2><p>Esta página é exclusiva do Dev SuperAdmin.</p>";
      return;
    }
    els.gate.remove();
    document.body.dataset.locked = "false";
    await loadPartners();
  } catch (error) {
    showError(error);
  }
}

async function loadPartners() {
  setBusy(true);
  try {
    const params = new URLSearchParams({
      page: String(state.partnerPage),
      limit: "20",
    });
    const search = els.partnerSearch.value.trim();
    if (search) params.set("search", search);
    if (els.linkStatus.value) params.set("linkStatus", els.linkStatus.value);
    const data = await api<
      Page<Partner> & {
        metrics: {
          totalPartners: number;
          activeLinks: number;
          totalReferredUsers: number;
          paidUsers: number;
        };
      }
    >(`/partners?${params}`);
    state.partners = data.items;
    state.partnerTotalPages = Math.max(1, data.totalPages);
    els.totalPartners.textContent = String(data.metrics.totalPartners);
    els.activeLinks.textContent = String(data.metrics.activeLinks);
    els.totalReferredUsers.textContent = String(data.metrics.totalReferredUsers);
    els.paidUsers.textContent = String(data.metrics.paidUsers);
    renderPartners();
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

function renderPartners() {
  els.partnerList.replaceChildren();
  els.partnerEmpty.style.display = state.partners.length ? "none" : "block";
  for (const partner of state.partners) {
    const card = document.createElement("article");
    card.className = `partner${state.selected?.id === partner.id ? " selected" : ""}`;
    card.dataset.partnerId = partner.id;
    card.innerHTML = `
      <div class="partner-row">
        <strong>${escapeHtml(partner.name)}</strong>
        <span class="badge ${partner.linkStatus}">${linkLabel(partner.linkStatus)}</span>
      </div>
      <div>${escapeHtml(partner.phone)} · ${escapeHtml(partner.bankNumber)}</div>
      <small>${partner.referralCount} indicação(ões) · ${partner.paidReferralCount ?? 0} pagante(s)</small>
      <div class="linkbox"><input readonly value="${escapeHtml(resolveLink(partner.sellerLink))}"><button type="button" class="secondary" data-copy="${escapeHtml(partner.sellerLink)}">Copiar</button></div>
    `;
    els.partnerList.appendChild(card);
  }
  els.partnersPage.textContent = `Página ${state.partnerPage} de ${state.partnerTotalPages}`;
  (byId<HTMLButtonElement>("partnersPrev")).disabled = state.partnerPage <= 1;
  (byId<HTMLButtonElement>("partnersNext")).disabled =
    state.partnerPage >= state.partnerTotalPages;
}

async function selectPartner(partner: Partner) {
  state.selected = partner;
  state.referralPage = 1;
  fillForm(partner);
  renderPartners();
  await loadReferrals();
}

function fillForm(partner: Partner) {
  els.formTitle.textContent = "Editar parceiro";
  els.id.value = partner.id;
  els.name.value = partner.name;
  els.phone.value = partner.phone;
  els.bankNumber.value = partner.bankNumber;
  els.systemType.value = partner.systemType;
  els.systemType.disabled = true;
  els.link.value = resolveLink(partner.sellerLink);
  byId<HTMLButtonElement>("toggleLinkBtn").textContent =
    partner.linkStatus === "ACTIVE" ? "Desativar link" : "Ativar link";
}

function resetForm() {
  state.selected = null;
  els.form.reset();
  els.id.value = "";
  els.link.value = "";
  els.systemType.disabled = false;
  els.formTitle.textContent = "Novo parceiro";
  els.selectedName.textContent = "Indicações";
  els.selectedInfo.textContent = "Selecione um parceiro.";
  els.referralsBody.replaceChildren();
  els.referralsEmpty.style.display = "block";
  renderPartners();
}

async function savePartner(event: SubmitEvent) {
  event.preventDefault();
  const payload = {
    name: els.name.value.trim(),
    phone: els.phone.value.trim(),
    bankNumber: els.bankNumber.value.trim(),
    ...(!els.id.value ? { systemType: els.systemType.value } : {}),
  };
  setBusy(true);
  try {
    const data = await api<{ partner: Partner }>(
      els.id.value ? `/partners/${els.id.value}` : "/partners",
      {
        method: els.id.value ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
    await loadPartners();
    await selectPartner(data.partner);
    showStatus("Parceiro salvo com sucesso.");
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function deletePartner() {
  if (!state.selected || !confirm(`Excluir "${state.selected.name}"?`)) return;
  setBusy(true);
  try {
    await api(`/partners/${state.selected.id}`, { method: "DELETE" });
    resetForm();
    await loadPartners();
    showStatus("Parceiro excluído e link revogado.");
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function rotateLink() {
  if (!state.selected || !confirm("O link anterior deixará de funcionar. Continuar?")) return;
  setBusy(true);
  try {
    const data = await api<{ partner: Partner }>(
      `/partners/${state.selected.id}/referral-link`,
      { method: "POST" },
    );
    await loadPartners();
    await selectPartner(data.partner);
    showStatus("Link rotacionado com segurança.");
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function toggleLink() {
  if (!state.selected) return;
  const status = state.selected.linkStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  setBusy(true);
  try {
    const data = await api<{ partner: Partner }>(
      `/partners/${state.selected.id}/referral-link/status`,
      { method: "PATCH", body: JSON.stringify({ status }) },
    );
    await loadPartners();
    await selectPartner(data.partner);
    showStatus(status === "ACTIVE" ? "Link ativado." : "Link desativado.");
  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
}

async function loadReferrals() {
  if (!state.selected) return;
  const params = new URLSearchParams({
    page: String(state.referralPage),
    limit: "20",
  });
  const search = els.referralSearch.value.trim();
  if (search) params.set("search", search);
  if (els.paymentFilter.value) params.set("paymentStatus", els.paymentFilter.value);
  if (els.seenFilter.value) params.set("seen", els.seenFilter.value);
  try {
    const data = await api<Page<Referral>>(
      `/partners/${state.selected.id}/referrals?${params}`,
    );
    state.referralTotalPages = Math.max(1, data.totalPages);
    renderReferrals(data.items);
  } catch (error) {
    showError(error);
  }
}

function renderReferrals(items: Referral[]) {
  els.referralsBody.replaceChildren();
  els.referralsEmpty.style.display = items.length ? "none" : "block";
  els.referralsEmpty.textContent = "Nenhuma indicação encontrada.";
  els.selectedName.textContent = state.selected?.name || "Indicações";
  els.selectedInfo.textContent = `${items.length} resultado(s) nesta página.`;
  for (const referral of items) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(referral.email)}</td>
      <td>${escapeHtml(referral.companyName)}</td>
      <td>${escapeHtml(formatDate(referral.registeredAt))}</td>
      <td>${referral.systemType === "petshop" ? "Pet Shop" : "Padrão"}</td>
      <td><span class="badge ${referral.paymentStatus}">${paymentLabel(referral.paymentStatus)}</span></td>
      <td><input type="checkbox" data-seen="${referral.id}" ${referral.seen ? "checked" : ""} aria-label="Visto"></td>
      <td><button type="button" class="secondary" data-payment="${referral.id}" data-current="${referral.paymentStatus}">${referral.paymentStatus === "PAID" ? "Marcar não pago" : "Marcar pago"}</button></td>
    `;
    els.referralsBody.appendChild(row);
  }
  els.referralsPage.textContent = `Página ${state.referralPage} de ${state.referralTotalPages}`;
  byId<HTMLButtonElement>("referralsPrev").disabled = state.referralPage <= 1;
  byId<HTMLButtonElement>("referralsNext").disabled =
    state.referralPage >= state.referralTotalPages;
}

async function updateSeen(input: HTMLInputElement) {
  if (!state.selected) return;
  const previous = !input.checked;
  input.disabled = true;
  try {
    await api(`/partners/${state.selected.id}/referrals/${input.dataset.seen}/seen`, {
      method: "PATCH",
      body: JSON.stringify({ seen: input.checked }),
    });
    showStatus("Marcação de visto salva.");
  } catch (error) {
    input.checked = previous;
    showError(error);
  } finally {
    input.disabled = false;
  }
}

async function updatePayment(button: HTMLButtonElement) {
  if (!state.selected) return;
  const current = button.dataset.current as PaymentStatus;
  const paymentStatus: PaymentStatus = current === "PAID" ? "UNPAID" : "PAID";
  const reason = prompt("Motivo da alteração (opcional):")?.trim();
  button.disabled = true;
  try {
    await api(
      `/partners/${state.selected.id}/referrals/${button.dataset.payment}/payment-status`,
      {
        method: "PATCH",
        body: JSON.stringify({
          paymentStatus,
          ...(reason ? { reason } : {}),
        }),
      },
    );
    await Promise.all([loadReferrals(), loadPartners()]);
    showStatus("Pagamento atualizado com histórico de auditoria.");
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

function setBusy(value: boolean) {
  state.busy = value;
  document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.disabled = value;
  });
}

function showStatus(message: string) {
  els.status.textContent = message;
  els.status.className = "status show ok";
}

function showError(error: unknown) {
  els.status.textContent = error instanceof Error ? error.message : "Erro inesperado.";
  els.status.className = "status show error";
}

function resolveLink(link: string) {
  return new URL(link, window.location.origin).toString();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("pt-BR");
}

function linkLabel(value: LinkStatus) {
  return { ACTIVE: "Ativo", INACTIVE: "Inativo", REVOKED: "Revogado" }[value];
}

function paymentLabel(value: PaymentStatus) {
  return {
    UNPAID: "Não pagou",
    PAID: "Já pagou",
    REFUNDED: "Reembolsado",
    CANCELED: "Cancelado",
  }[value];
}

els.form.addEventListener("submit", savePartner);
byId("newPartnerBtn").addEventListener("click", resetForm);
byId("deletePartnerBtn").addEventListener("click", deletePartner);
byId("rotateLinkBtn").addEventListener("click", rotateLink);
byId("toggleLinkBtn").addEventListener("click", toggleLink);
byId("copyLinkBtn").addEventListener("click", () => {
  if (els.link.value) void navigator.clipboard.writeText(els.link.value);
});
els.partnerList.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const copy = target.closest<HTMLButtonElement>("[data-copy]");
  if (copy) {
    void navigator.clipboard.writeText(resolveLink(copy.dataset.copy || ""));
    return;
  }
  const card = target.closest<HTMLElement>("[data-partner-id]");
  const partner = state.partners.find((item) => item.id === card?.dataset.partnerId);
  if (partner) void selectPartner(partner);
});
els.referralsBody.addEventListener("change", (event) => {
  const input = (event.target as HTMLElement).closest<HTMLInputElement>("[data-seen]");
  if (input) void updateSeen(input);
});
els.referralsBody.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-payment]");
  if (button) void updatePayment(button);
});
for (const element of [els.partnerSearch, els.referralSearch]) {
  element.addEventListener("input", () => {
    window.clearTimeout(state.searchTimer);
    state.searchTimer = window.setTimeout(() => {
      if (element === els.partnerSearch) {
        state.partnerPage = 1;
        void loadPartners();
      } else {
        state.referralPage = 1;
        void loadReferrals();
      }
    }, 350);
  });
}
els.linkStatus.addEventListener("change", () => {
  state.partnerPage = 1;
  void loadPartners();
});
for (const element of [els.paymentFilter, els.seenFilter]) {
  element.addEventListener("change", () => {
    state.referralPage = 1;
    void loadReferrals();
  });
}
byId("partnersPrev").addEventListener("click", () => {
  state.partnerPage -= 1;
  void loadPartners();
});
byId("partnersNext").addEventListener("click", () => {
  state.partnerPage += 1;
  void loadPartners();
});
byId("referralsPrev").addEventListener("click", () => {
  state.referralPage -= 1;
  void loadReferrals();
});
byId("referralsNext").addEventListener("click", () => {
  state.referralPage += 1;
  void loadReferrals();
});

void bootstrap();

export {};
