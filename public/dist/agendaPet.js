const STATUS_LABELS = {
    scheduled: "Agendado",
    confirmed: "Confirmado",
    in_progress: "Em atendimento",
    completed: "Concluido",
    canceled: "Cancelado",
    no_show: "Nao compareceu",
};
const pageSize = 12;
let currentPage = 1;
let totalPages = 0;
let appointments = [];
let clients = [];
let selectedBranch = null;
let canWrite = false;
let editingAppointmentId = null;
let appointmentIdToDelete = null;
const agendaContainer = element("agendaContainer");
const pagination = element("pagination");
const resultsCount = element("resultsCount");
const sessionBadge = element("sessionBadge");
const atendenteSearch = element("atendenteSearch");
const dateFilterType = element("dateFilterType");
const startDateFrom = element("startDateFrom");
const startDateTo = element("startDateTo");
const dateDay = element("dateDay");
const dateWeek = element("dateWeek");
const dateMonth = element("dateMonth");
const dateYear = element("dateYear");
const dayField = element("dayField");
const weekField = element("weekField");
const monthField = element("monthField");
const yearField = element("yearField");
const statusFilter = element("statusFilter");
const clientFilter = element("clientFilter");
const petFilter = element("petFilter");
const applyFiltersBtn = element("applyFiltersBtn");
const clearFiltersBtn = element("clearFiltersBtn");
const openCreateAgendaBtn = element("openCreateAgendaBtn");
const confirmOverlay = element("confirmOverlay");
const confirmDeleteYes = element("confirmDeleteYes");
const confirmDeleteNo = element("confirmDeleteNo");
const agendaModal = element("agendaModal");
const agendaModalTitle = element("agendaModalTitle");
const agendaClient = element("agendaClient");
const agendaPet = element("agendaPet");
const agendaService = element("agendaService");
const agendaAttendant = element("agendaAttendant");
const agendaStartAt = element("agendaStartAt");
const agendaEndAt = element("agendaEndAt");
const agendaStatus = element("agendaStatus");
const agendaPrice = element("agendaPrice");
const agendaNotes = element("agendaNotes");
const agendaCancellationReason = element("agendaCancellationReason");
const saveAgendaBtn = element("saveAgendaBtn");
const closeAgendaModalBtn = element("closeAgendaModalBtn");
function element(id) {
    const found = document.getElementById(id);
    if (!found) {
        throw new Error(`Missing element #${id}`);
    }
    return found;
}
function isDemoMode() {
    const params = new URLSearchParams(window.location.search);
    return (sessionStorage.getItem("nextstockIsPreview") === "true" ||
        sessionStorage.getItem("nextstockPreviewMode") === "true" ||
        sessionStorage.getItem("nextstockBackendMode") === "preview" ||
        params.get("mode") === "preview" ||
        params.get("mode") === "visualizacao");
}
function branchHeaders() {
    const headers = {};
    if (selectedBranch?.id) {
        headers["x-nextstock-branch-id"] = selectedBranch.id;
    }
    try {
        const supportContext = JSON.parse(sessionStorage.getItem("nextstockDevSupportContext") || "null");
        if (supportContext?.branchId === selectedBranch?.id &&
            supportContext?.mode === "support") {
            headers["x-nextstock-dev-context"] = "support";
        }
    }
    catch {
    }
    return headers;
}
async function apiFetch(url, init = {}) {
    const response = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...branchHeaders(),
            ...(init.headers || {}),
        },
    });
    if (response.status === 401) {
        window.clearNextStockSessionState?.();
        window.location.href = "index.html";
        throw new Error("Sessao expirada ou invalida.");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || `Erro ${response.status}`);
    }
    return payload;
}
async function init() {
    setLoading("Validando sessao...");
    if (isDemoMode()) {
        canWrite = false;
        openCreateAgendaBtn.disabled = true;
        sessionBadge.textContent = "Modo visualizacao";
        renderEmpty("Modo visualizacao: agenda real indisponivel nesta pagina.");
        return;
    }
    try {
        const profile = await apiFetch("/api/auth/profile");
        selectedBranch = profile.selectedBranch || null;
        const context = await loadSystemContext();
        selectedBranch = context.selectedBranch || selectedBranch;
        if (context.tenantType !== "PETSHOP") {
            blockPage("Pagina exclusiva do modo Pet Shop.");
            return;
        }
        canWrite = context.systemMode === "PRODUCTION";
        openCreateAgendaBtn.disabled = !canWrite;
        sessionBadge.textContent = canWrite
            ? "Agenda em producao"
            : "Modo visualizacao";
        persistBackendContext(context);
        await loadClients();
        await loadAppointments();
    }
    catch (error) {
        renderError(error);
    }
}
async function loadSystemContext() {
    const queryBranch = selectedBranch?.id;
    const response = await fetch("/api/system/context", {
        method: "GET",
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...(queryBranch ? { "x-nextstock-branch-id": queryBranch } : {}),
            ...branchHeaders(),
        },
    });
    if (response.status === 401) {
        window.clearNextStockSessionState?.();
        window.location.href = "index.html";
        throw new Error("Sessao expirada ou invalida.");
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(payload?.message || "Contexto do sistema invalido.");
    }
    return payload;
}
function persistBackendContext(context) {
    sessionStorage.setItem("nextstockBackendMode", "production");
    sessionStorage.setItem("nextstockSystemType", context.tenantType === "PETSHOP" ? "petshop" : "padrao");
    sessionStorage.setItem("nextstockSelectedSystemType", context.tenantType === "PETSHOP" ? "petshop" : "padrao");
    if (selectedBranch) {
        sessionStorage.setItem("nextstockSelectedBranch", JSON.stringify(selectedBranch));
        sessionStorage.setItem("nextstockBranchId", selectedBranch.id);
        sessionStorage.setItem("nextstockTenantId", selectedBranch.tenantId);
    }
}
async function loadClients() {
    const response = await apiFetch("/api/pet-clients?page=1&pageSize=100");
    clients = response.clients || [];
    populateClientSelects();
}
async function loadAppointments() {
    setLoading("Carregando agenda...");
    const params = buildQueryParams();
    const response = await apiFetch(`/api/agenda-pet?${params.toString()}`);
    appointments = response.items || response.data || [];
    currentPage = response.page || currentPage;
    totalPages = response.totalPages || 0;
    resultsCount.textContent = `${response.total || appointments.length} agendamento(s) encontrado(s)`;
    renderAgenda();
    renderPagination();
}
function buildQueryParams() {
    const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(pageSize),
    });
    const search = atendenteSearch.value.trim();
    const range = resolveDateRange();
    if (search)
        params.set("search", search);
    if (statusFilter.value)
        params.set("status", statusFilter.value);
    if (clientFilter.value)
        params.set("clientId", clientFilter.value);
    if (petFilter.value)
        params.set("petId", petFilter.value);
    if (range?.from)
        params.set("startAtFrom", range.from);
    if (range?.to)
        params.set("startAtTo", range.to);
    return params;
}
function resolveDateRange() {
    if (startDateFrom.value || startDateTo.value) {
        const start = startDateFrom.value
            ? new Date(`${startDateFrom.value}T00:00:00`)
            : null;
        const end = startDateTo.value
            ? new Date(`${startDateTo.value}T23:59:59.999`)
            : null;
        return {
            from: (start || new Date(0)).toISOString(),
            to: (end || new Date("9999-12-31T23:59:59.999Z")).toISOString(),
        };
    }
    if (dateFilterType.value === "day" && dateDay.value) {
        const start = new Date(`${dateDay.value}T00:00:00`);
        const end = new Date(`${dateDay.value}T23:59:59.999`);
        return { from: start.toISOString(), to: end.toISOString() };
    }
    if (dateFilterType.value === "week" && dateWeek.value) {
        const [year, week] = dateWeek.value.split("-W").map(Number);
        const start = isoWeekStart(year, week);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
    }
    if (dateFilterType.value === "month" && dateMonth.value) {
        const [year, month] = dateMonth.value.split("-").map(Number);
        const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const end = new Date(year, month, 0, 23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
    }
    if (dateFilterType.value === "year" && dateYear.value) {
        const year = Number(dateYear.value);
        const start = new Date(year, 0, 1, 0, 0, 0, 0);
        const end = new Date(year, 11, 31, 23, 59, 59, 999);
        return { from: start.toISOString(), to: end.toISOString() };
    }
    return null;
}
function isoWeekStart(year, week) {
    const firstThursday = new Date(year, 0, 4);
    const day = firstThursday.getDay() || 7;
    const start = new Date(firstThursday);
    start.setDate(firstThursday.getDate() - day + 1 + (week - 1) * 7);
    start.setHours(0, 0, 0, 0);
    return start;
}
function populateClientSelects() {
    const options = ['<option value="">Todos</option>']
        .concat(clients.map((client) => `<option value="${escapeHtml(client.id)}">${escapeHtml(client.name)}</option>`))
        .join("");
    clientFilter.innerHTML = options;
    agendaClient.innerHTML = options.replace("Todos", "Selecione");
    populatePetSelects();
    populateYearOptions();
}
function populatePetSelects() {
    const selectedClientId = clientFilter.value || agendaClient.value;
    const availablePets = selectedClientId
        ? clients.find((client) => client.id === selectedClientId)?.pets || []
        : clients.flatMap((client) => client.pets || []);
    const options = ['<option value="">Todos</option>']
        .concat(availablePets.map((pet) => `<option value="${escapeHtml(pet.id)}">${escapeHtml(pet.name)}</option>`))
        .join("");
    petFilter.innerHTML = options;
    agendaPet.innerHTML = options.replace("Todos", "Selecione");
}
function populateYearOptions() {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear, currentYear + 1];
    dateYear.innerHTML = '<option value="">Selecione</option>';
    years.forEach((year) => {
        const option = document.createElement("option");
        option.value = String(year);
        option.textContent = String(year);
        dateYear.appendChild(option);
    });
}
function renderAgenda() {
    agendaContainer.innerHTML = "";
    if (!appointments.length) {
        renderEmpty("Nenhum agendamento encontrado com os filtros selecionados.");
        return;
    }
    appointments.forEach((item) => {
        const card = document.createElement("div");
        card.className = "agenda-card";
        card.innerHTML = `
      ${canWrite ? `<button class="delete-card-btn" type="button" data-delete-id="${escapeHtml(item.id)}">X</button>` : ""}
      <div class="agenda-card-header">
        <div class="badge">${escapeHtml(STATUS_LABELS[item.status] || item.status)}</div>
      </div>
      <div class="agenda-title">${escapeHtml(item.cliente)} - ${escapeHtml(item.animal)}</div>
      <div class="agenda-meta">
        <div class="agenda-meta-row"><span>Servico</span><span>${escapeHtml(item.servico)}</span></div>
        <div class="agenda-meta-row"><span>Atendente</span><span>${escapeHtml(item.atendente)}</span></div>
        <div class="agenda-meta-row"><span>Inicio</span><span>${escapeHtml(formatDateTime(item.startAt || item.data, item.hora))}</span></div>
        <div class="agenda-meta-row"><span>Valor</span><span>${escapeHtml(formatCurrency(item.preco))}</span></div>
      </div>
      <div class="agenda-desc">${escapeHtml(item.notes || item.descricao || "Sem observacoes.")}</div>
      ${canWrite ? `<button class="btn btn-secondary" type="button" data-edit-id="${escapeHtml(item.id)}">Editar</button>` : ""}
    `;
        card.querySelector("[data-edit-id]")?.addEventListener("click", () => openEditModal(item.id));
        card.querySelector("[data-delete-id]")?.addEventListener("click", () => openDeleteConfirm(item.id));
        agendaContainer.appendChild(card);
    });
}
function renderPagination() {
    pagination.innerHTML = "";
    if (totalPages <= 1)
        return;
    const previous = document.createElement("button");
    previous.textContent = "Anterior";
    previous.disabled = currentPage <= 1;
    previous.addEventListener("click", () => changePage(currentPage - 1));
    pagination.appendChild(previous);
    for (let page = 1; page <= totalPages; page += 1) {
        const button = document.createElement("button");
        button.textContent = String(page);
        button.classList.toggle("active", page === currentPage);
        button.addEventListener("click", () => changePage(page));
        pagination.appendChild(button);
    }
    const next = document.createElement("button");
    next.textContent = "Proxima";
    next.disabled = currentPage >= totalPages;
    next.addEventListener("click", () => changePage(currentPage + 1));
    pagination.appendChild(next);
}
async function changePage(page) {
    currentPage = page;
    await loadAppointments();
}
function openCreateModal() {
    if (!ensureCanWrite())
        return;
    editingAppointmentId = null;
    agendaModalTitle.textContent = "Novo agendamento";
    resetForm();
    agendaModal.classList.add("active");
}
function openEditModal(id) {
    if (!ensureCanWrite())
        return;
    const appointment = appointments.find((item) => item.id === id);
    if (!appointment)
        return;
    editingAppointmentId = id;
    agendaModalTitle.textContent = "Editar agendamento";
    agendaClient.value = appointment.clientId;
    populatePetSelects();
    agendaPet.value = appointment.petId;
    agendaService.value = appointment.servico;
    agendaAttendant.value = appointment.atendente;
    agendaStartAt.value = toDateTimeLocal(appointment.startAt || appointment.data);
    agendaEndAt.value = toDateTimeLocal(appointment.endAt || "");
    agendaStatus.value = appointment.status;
    agendaPrice.value = String(appointment.preco ?? "");
    agendaNotes.value = appointment.notes || appointment.descricao || "";
    agendaCancellationReason.value = appointment.cancellationReason || "";
    agendaModal.classList.add("active");
}
function closeModal() {
    agendaModal.classList.remove("active");
    editingAppointmentId = null;
    resetForm();
}
function resetForm() {
    agendaClient.value = "";
    populatePetSelects();
    agendaPet.value = "";
    agendaService.value = "";
    agendaAttendant.value = "";
    agendaStartAt.value = "";
    agendaEndAt.value = "";
    agendaStatus.value = "scheduled";
    agendaPrice.value = "";
    agendaNotes.value = "";
    agendaCancellationReason.value = "";
}
async function saveAppointment() {
    if (!ensureCanWrite())
        return;
    const client = clients.find((item) => item.id === agendaClient.value);
    const pet = client?.pets.find((item) => item.id === agendaPet.value);
    const start = agendaStartAt.value ? new Date(agendaStartAt.value) : null;
    const end = agendaEndAt.value ? new Date(agendaEndAt.value) : null;
    if (!client || !pet || !start || Number.isNaN(start.getTime())) {
        alert("Preencha cliente, animal e inicio do agendamento.");
        return;
    }
    const service = agendaService.value.trim();
    const attendant = agendaAttendant.value.trim();
    const price = Number(agendaPrice.value || 0);
    if (!service || !attendant || !Number.isFinite(price)) {
        alert("Preencha servico, atendente e valor.");
        return;
    }
    const payload = {
        clientId: client.id,
        petId: pet.id,
        cliente: client.name,
        animal: pet.name,
        servico: service,
        atendente: attendant,
        data: toDateInput(start),
        hora: toTimeInput(start),
        startAt: start.toISOString(),
        endAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : undefined,
        status: agendaStatus.value,
        preco: price,
        descricao: agendaNotes.value.trim(),
        notes: agendaNotes.value.trim(),
        cancellationReason: agendaCancellationReason.value.trim() || undefined,
    };
    const url = editingAppointmentId
        ? `/api/agenda-pet/${editingAppointmentId}`
        : "/api/agenda-pet";
    const method = editingAppointmentId ? "PATCH" : "POST";
    await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    closeModal();
    await loadAppointments();
    alert("Agendamento salvo com sucesso.");
}
function openDeleteConfirm(id) {
    if (!ensureCanWrite())
        return;
    appointmentIdToDelete = id;
    confirmOverlay.classList.add("active");
}
function closeDeleteConfirm() {
    appointmentIdToDelete = null;
    confirmOverlay.classList.remove("active");
}
async function deleteAppointment() {
    if (!ensureCanWrite() || !appointmentIdToDelete)
        return;
    await apiFetch(`/api/agenda-pet/${appointmentIdToDelete}`, {
        method: "DELETE",
    });
    closeDeleteConfirm();
    await loadAppointments();
    alert("Agendamento excluido com sucesso.");
}
function ensureCanWrite() {
    if (!canWrite) {
        alert("Modo visualizacao: alteracao bloqueada.");
        return false;
    }
    return true;
}
function updateDateFields() {
    dayField.classList.add("hidden");
    weekField.classList.add("hidden");
    monthField.classList.add("hidden");
    yearField.classList.add("hidden");
    if (dateFilterType.value === "day")
        dayField.classList.remove("hidden");
    if (dateFilterType.value === "week")
        weekField.classList.remove("hidden");
    if (dateFilterType.value === "month")
        monthField.classList.remove("hidden");
    if (dateFilterType.value === "year")
        yearField.classList.remove("hidden");
}
function setLoading(message) {
    resultsCount.textContent = message;
    agendaContainer.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    pagination.innerHTML = "";
}
function blockPage(message) {
    openCreateAgendaBtn.disabled = true;
    sessionBadge.textContent = "Acesso bloqueado";
    renderEmpty(message);
}
function renderEmpty(message) {
    agendaContainer.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
    pagination.innerHTML = "";
}
function renderError(error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar agenda.";
    sessionBadge.textContent = "Erro";
    renderEmpty(message);
}
function formatDateTime(value, fallbackTime) {
    if (!value)
        return fallbackTime || "Nao informado";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return fallbackTime || value;
    return `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
    })}`;
}
function formatCurrency(value) {
    return Number(value || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
    });
}
function toDateTimeLocal(value) {
    if (!value)
        return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function toDateInput(date) {
    return date.toISOString().slice(0, 10);
}
function toTimeInput(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
dateFilterType.addEventListener("change", updateDateFields);
applyFiltersBtn.addEventListener("click", () => {
    currentPage = 1;
    void loadAppointments();
});
clearFiltersBtn.addEventListener("click", () => {
    atendenteSearch.value = "";
    dateFilterType.value = "";
    dateDay.value = "";
    dateWeek.value = "";
    dateMonth.value = "";
    dateYear.value = "";
    startDateFrom.value = "";
    startDateTo.value = "";
    statusFilter.value = "";
    clientFilter.value = "";
    petFilter.value = "";
    updateDateFields();
    populatePetSelects();
    currentPage = 1;
    void loadAppointments();
});
clientFilter.addEventListener("change", () => {
    petFilter.value = "";
    populatePetSelects();
});
agendaClient.addEventListener("change", () => {
    agendaPet.value = "";
    populatePetSelects();
});
openCreateAgendaBtn.addEventListener("click", openCreateModal);
saveAgendaBtn.addEventListener("click", () => void saveAppointment());
closeAgendaModalBtn.addEventListener("click", closeModal);
confirmDeleteYes.addEventListener("click", () => void deleteAppointment());
confirmDeleteNo.addEventListener("click", closeDeleteConfirm);
confirmOverlay.addEventListener("click", (event) => {
    if (event.target === confirmOverlay)
        closeDeleteConfirm();
});
agendaModal.addEventListener("click", (event) => {
    if (event.target === agendaModal)
        closeModal();
});
populateYearOptions();
updateDateFields();
void init();
export {};
