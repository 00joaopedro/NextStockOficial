const byId = (id) => document.getElementById(id);
const els = {
    gate: byId('accessGate'),
    status: byId('statusBox'),
    form: byId('partnerForm'),
    formTitle: byId('formTitle'),
    id: byId('partnerId'),
    name: byId('partnerName'),
    phone: byId('partnerPhone'),
    bankNumber: byId('partnerBankNumber'),
    systemType: byId('partnerSystemType'),
    link: byId('partnerLink'),
    partnerList: byId('partnerList'),
    partnerEmpty: byId('partnerEmpty'),
    partnerSearch: byId('partnerSearchInput'),
    linkStatus: byId('linkStatusFilter'),
    referralsBody: byId('referralsBody'),
    referralsEmpty: byId('referralsEmpty'),
    referralSearch: byId('referralSearchInput'),
    paymentFilter: byId('paymentFilter'),
    seenFilter: byId('seenFilter'),
    selectedName: byId('selectedPartnerName'),
    selectedInfo: byId('selectedPartnerInfo'),
    partnersPage: byId('partnersPage'),
    referralsPage: byId('referralsPage'),
    totalPartners: byId('totalPartners'),
    activeLinks: byId('activeLinks'),
    totalReferredUsers: byId('totalReferredUsers'),
    paidUsers: byId('paidUsers'),
};
const state = {
    partners: [],
    selected: null,
    partnerPage: 1,
    partnerTotalPages: 1,
    referralPage: 1,
    referralTotalPages: 1,
    busy: false,
    searchTimer: 0,
    preview: false,
};
function operationalHeaders() {
    try {
        const branch = JSON.parse(sessionStorage.getItem('nextstockSelectedBranch') || 'null');
        const support = JSON.parse(sessionStorage.getItem('nextstockDevSupportContext') || 'null');
        return {
            ...(branch?.id ? { 'x-nextstock-branch-id': branch.id } : {}),
            ...(support?.branchId === branch?.id && support?.mode === 'support'
                ? { 'x-nextstock-dev-context': 'support' }
                : {}),
        };
    }
    catch {
        return {};
    }
}
async function api(path, options = {}) {
    const response = await fetch(`/api${path}`, {
        credentials: 'include',
        ...options,
        headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...operationalHeaders(),
            ...(options.headers || {}),
        },
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) {
        window.clearNextStockSessionState?.();
        window.location.href = 'index.html';
        throw new Error('Sessão expirada.');
    }
    if (!response.ok) {
        const fallback = {
            403: 'Acesso restrito ao Dev SuperAdmin.',
            404: 'Registro não encontrado.',
            409: 'Conflito ao salvar. Atualize a página.',
            422: 'Dados inválidos.',
            429: 'Muitas tentativas. Aguarde e tente novamente.',
            500: 'Erro interno. Tente novamente.',
        };
        const message = Array.isArray(body.message)
            ? body.message.join(' ')
            : body.message ||
                fallback[response.status] ||
                'Não foi possível concluir.';
        throw new Error(message);
    }
    return body;
}
function isDevSuperAdmin(user) {
    return (user?.isDevSuperAdmin === true &&
        (user?.role === 'superAdmin' ||
            user?.roles?.includes?.('superAdmin') === true ||
            user?.isSuperAdmin === true ||
            user?.is_super_admin === true));
}
async function bootstrap() {
    try {
        const profile = await api('/auth/profile');
        if (!isDevSuperAdmin(profile.user)) {
            document.body.dataset.locked = 'true';
            els.gate.innerHTML =
                '<h2>Acesso restrito</h2><p>Esta página é exclusiva do Dev SuperAdmin.</p>';
            return;
        }
        const context = await api('/system/context');
        state.preview = context.systemMode === 'PREVIEW';
        window.setNextStockBackendContext?.(context);
        els.gate.remove();
        document.body.dataset.locked = 'false';
        await loadPartners();
    }
    catch (error) {
        showError(error);
    }
}
async function loadPartners() {
    setBusy(true);
    try {
        const params = new URLSearchParams({
            page: String(state.partnerPage),
            limit: '20',
        });
        const search = els.partnerSearch.value.trim();
        if (search)
            params.set('search', search);
        if (els.linkStatus.value)
            params.set('linkStatus', els.linkStatus.value);
        const data = await api(`/partners?${params}`);
        state.partners = data.items;
        state.partnerTotalPages = Math.max(1, data.totalPages);
        els.totalPartners.textContent = String(data.metrics.totalPartners);
        els.activeLinks.textContent = String(data.metrics.activeLinks);
        els.totalReferredUsers.textContent = String(data.metrics.totalReferredUsers);
        els.paidUsers.textContent = String(data.metrics.paidUsers);
        renderPartners();
    }
    catch (error) {
        showError(error);
    }
    finally {
        setBusy(false);
    }
}
function renderPartners() {
    els.partnerList.replaceChildren();
    els.partnerEmpty.style.display = state.partners.length ? 'none' : 'block';
    for (const partner of state.partners) {
        const card = document.createElement('article');
        card.className = `partner${state.selected?.id === partner.id ? ' selected' : ''}`;
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
    byId('partnersPrev').disabled = state.partnerPage <= 1;
    byId('partnersNext').disabled =
        state.partnerPage >= state.partnerTotalPages;
}
async function selectPartner(partner) {
    state.selected = partner;
    state.referralPage = 1;
    fillForm(partner);
    renderPartners();
    await loadReferrals();
}
function fillForm(partner) {
    els.formTitle.textContent = 'Editar parceiro';
    els.id.value = partner.id;
    els.name.value = partner.name;
    els.phone.value = partner.phone;
    els.bankNumber.value = partner.bankNumber;
    els.systemType.value = partner.systemType;
    els.systemType.disabled = true;
    els.link.value = resolveLink(partner.sellerLink);
    byId('toggleLinkBtn').textContent =
        partner.linkStatus === 'ACTIVE' ? 'Desativar link' : 'Ativar link';
}
function resetForm() {
    state.selected = null;
    els.form.reset();
    els.id.value = '';
    els.link.value = '';
    els.systemType.disabled = false;
    els.formTitle.textContent = 'Novo parceiro';
    els.selectedName.textContent = 'Indicações';
    els.selectedInfo.textContent = 'Selecione um parceiro.';
    els.referralsBody.replaceChildren();
    els.referralsEmpty.style.display = 'block';
    renderPartners();
}
async function savePartner(event) {
    event.preventDefault();
    const payload = {
        name: els.name.value.trim(),
        phone: els.phone.value.trim(),
        bankNumber: els.bankNumber.value.trim(),
        ...(!els.id.value ? { systemType: els.systemType.value } : {}),
    };
    setBusy(true);
    try {
        const data = await api(els.id.value ? `/partners/${els.id.value}` : '/partners', {
            method: els.id.value ? 'PATCH' : 'POST',
            body: JSON.stringify(payload),
        });
        await loadPartners();
        await selectPartner(data.partner);
        showStatus('Parceiro salvo com sucesso.');
    }
    catch (error) {
        showError(error);
    }
    finally {
        setBusy(false);
    }
}
async function deletePartner() {
    if (!state.selected || !confirm(`Excluir "${state.selected.name}"?`))
        return;
    setBusy(true);
    try {
        await api(`/partners/${state.selected.id}`, { method: 'DELETE' });
        resetForm();
        await loadPartners();
        showStatus('Parceiro excluído e link revogado.');
    }
    catch (error) {
        showError(error);
    }
    finally {
        setBusy(false);
    }
}
async function rotateLink() {
    if (!state.selected ||
        !confirm('O link anterior deixará de funcionar. Continuar?'))
        return;
    setBusy(true);
    try {
        const data = await api(`/partners/${state.selected.id}/referral-link`, { method: 'POST' });
        await loadPartners();
        await selectPartner(data.partner);
        showStatus('Link rotacionado com segurança.');
    }
    catch (error) {
        showError(error);
    }
    finally {
        setBusy(false);
    }
}
async function toggleLink() {
    if (!state.selected)
        return;
    const status = state.selected.linkStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setBusy(true);
    try {
        const data = await api(`/partners/${state.selected.id}/referral-link/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        await loadPartners();
        await selectPartner(data.partner);
        showStatus(status === 'ACTIVE' ? 'Link ativado.' : 'Link desativado.');
    }
    catch (error) {
        showError(error);
    }
    finally {
        setBusy(false);
    }
}
async function loadReferrals() {
    if (!state.selected)
        return;
    const params = new URLSearchParams({
        page: String(state.referralPage),
        limit: '20',
    });
    const search = els.referralSearch.value.trim();
    if (search)
        params.set('search', search);
    if (els.paymentFilter.value)
        params.set('paymentStatus', els.paymentFilter.value);
    if (els.seenFilter.value)
        params.set('seen', els.seenFilter.value);
    try {
        const data = await api(`/partners/${state.selected.id}/referrals?${params}`);
        state.referralTotalPages = Math.max(1, data.totalPages);
        renderReferrals(data.items);
    }
    catch (error) {
        showError(error);
    }
}
function renderReferrals(items) {
    els.referralsBody.replaceChildren();
    els.referralsEmpty.style.display = items.length ? 'none' : 'block';
    els.referralsEmpty.textContent = 'Nenhuma indicação encontrada.';
    els.selectedName.textContent = state.selected?.name || 'Indicações';
    els.selectedInfo.textContent = `${items.length} resultado(s) nesta página.`;
    for (const referral of items) {
        const row = document.createElement('tr');
        row.innerHTML = `
      <td>${escapeHtml(referral.email)}</td>
      <td>${escapeHtml(referral.companyName)}</td>
      <td>${escapeHtml(formatDate(referral.registeredAt))}</td>
      <td>${referral.systemType === 'petshop' ? 'Pet Shop' : 'Padrão'}</td>
      <td><span class="badge ${referral.paymentStatus}">${paymentLabel(referral.paymentStatus)}</span></td>
      <td><input type="checkbox" data-seen="${referral.id}" ${referral.seen ? 'checked' : ''} aria-label="Visto"></td>
      <td><button type="button" class="secondary" data-payment="${referral.id}" data-current="${referral.paymentStatus}">${referral.paymentStatus === 'PAID' ? 'Marcar não pago' : 'Marcar pago'}</button></td>
    `;
        els.referralsBody.appendChild(row);
    }
    els.referralsPage.textContent = `Página ${state.referralPage} de ${state.referralTotalPages}`;
    byId('referralsPrev').disabled = state.referralPage <= 1;
    byId('referralsNext').disabled =
        state.referralPage >= state.referralTotalPages;
}
async function updateSeen(input) {
    if (!state.selected)
        return;
    const previous = !input.checked;
    input.disabled = true;
    try {
        await api(`/partners/${state.selected.id}/referrals/${input.dataset.seen}/seen`, {
            method: 'PATCH',
            body: JSON.stringify({ seen: input.checked }),
        });
        showStatus('Marcação de visto salva.');
    }
    catch (error) {
        input.checked = previous;
        showError(error);
    }
    finally {
        input.disabled = false;
    }
}
async function updatePayment(button) {
    if (!state.selected)
        return;
    const current = button.dataset.current;
    const paymentStatus = current === 'PAID' ? 'UNPAID' : 'PAID';
    const reason = prompt('Motivo da alteração (opcional):')?.trim();
    button.disabled = true;
    try {
        await api(`/partners/${state.selected.id}/referrals/${button.dataset.payment}/payment-status`, {
            method: 'PATCH',
            body: JSON.stringify({
                paymentStatus,
                ...(reason ? { reason } : {}),
            }),
        });
        await Promise.all([loadReferrals(), loadPartners()]);
        showStatus('Pagamento atualizado com histórico de auditoria.');
    }
    catch (error) {
        showError(error);
    }
    finally {
        button.disabled = false;
    }
}
function setBusy(value) {
    state.busy = value;
    document.querySelectorAll('button').forEach((button) => {
        button.disabled = value || state.preview;
    });
}
function showStatus(message) {
    els.status.textContent = message;
    els.status.className = 'status show ok';
}
function showError(error) {
    els.status.textContent =
        error instanceof Error ? error.message : 'Erro inesperado.';
    els.status.className = 'status show error';
}
function resolveLink(link) {
    return new URL(link, window.location.origin).toString();
}
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function formatDate(value) {
    return new Date(value).toLocaleString('pt-BR');
}
function linkLabel(value) {
    return { ACTIVE: 'Ativo', INACTIVE: 'Inativo', REVOKED: 'Revogado' }[value];
}
function paymentLabel(value) {
    return {
        UNPAID: 'Não pagou',
        PAID: 'Já pagou',
        REFUNDED: 'Reembolsado',
        CANCELED: 'Cancelado',
    }[value];
}
els.form.addEventListener('submit', savePartner);
byId('newPartnerBtn').addEventListener('click', resetForm);
byId('deletePartnerBtn').addEventListener('click', deletePartner);
byId('rotateLinkBtn').addEventListener('click', rotateLink);
byId('toggleLinkBtn').addEventListener('click', toggleLink);
byId('copyLinkBtn').addEventListener('click', () => {
    if (els.link.value)
        void navigator.clipboard.writeText(els.link.value);
});
els.partnerList.addEventListener('click', (event) => {
    const target = event.target;
    const copy = target.closest('[data-copy]');
    if (copy) {
        void navigator.clipboard.writeText(resolveLink(copy.dataset.copy || ''));
        return;
    }
    const card = target.closest('[data-partner-id]');
    const partner = state.partners.find((item) => item.id === card?.dataset.partnerId);
    if (partner)
        void selectPartner(partner);
});
els.referralsBody.addEventListener('change', (event) => {
    const input = event.target.closest('[data-seen]');
    if (input)
        void updateSeen(input);
});
els.referralsBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-payment]');
    if (button)
        void updatePayment(button);
});
for (const element of [els.partnerSearch, els.referralSearch]) {
    element.addEventListener('input', () => {
        window.clearTimeout(state.searchTimer);
        state.searchTimer = window.setTimeout(() => {
            if (element === els.partnerSearch) {
                state.partnerPage = 1;
                void loadPartners();
            }
            else {
                state.referralPage = 1;
                void loadReferrals();
            }
        }, 350);
    });
}
els.linkStatus.addEventListener('change', () => {
    state.partnerPage = 1;
    void loadPartners();
});
for (const element of [els.paymentFilter, els.seenFilter]) {
    element.addEventListener('change', () => {
        state.referralPage = 1;
        void loadReferrals();
    });
}
byId('partnersPrev').addEventListener('click', () => {
    state.partnerPage -= 1;
    void loadPartners();
});
byId('partnersNext').addEventListener('click', () => {
    state.partnerPage += 1;
    void loadPartners();
});
byId('referralsPrev').addEventListener('click', () => {
    state.referralPage -= 1;
    void loadReferrals();
});
byId('referralsNext').addEventListener('click', () => {
    state.referralPage += 1;
    void loadReferrals();
});
void bootstrap();
export {};
