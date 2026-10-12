(() => {
  const slug = 'lancamento-2026';
  const $ = (id) => document.getElementById(id);
  const status = $('status');
  let lastDashboard = null;
  let loading = false;

  const money = (cents) => cents == null ? '-' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';

  function setStatus(message, error = false) {
    status.textContent = message;
    status.className = `status${error ? ' error' : ''}`;
  }

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(
        `/api/promotions/admin/${encodeURIComponent(slug)}/${path}`,
        {
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {}),
          },
          ...options,
          signal: options.signal || controller.signal,
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = Array.isArray(body.message) ? body.message.join(' ') : body.message;
        const error = new Error(detail || `Falha no painel (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      return body;
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('O painel demorou para responder. Tente atualizar.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function renderMetrics(c) {
    const campaign = c || {};
    $('metrics').innerHTML = [
      ['Status', campaign.status || '-'],
      ['Vagas', `${campaign.convertedConversions || 0}/${campaign.maxConversions || 0}`],
      ['Reservas ativas', campaign.reservedConversions || 0],
      ['Vagas restantes', campaign.remainingSlots || 0],
      ['Trial promocional', `${campaign.trialDays || 0} dia`],
    ].map(([label, value]) => `<article class="card metric"><strong>${label}</strong><span>${value}</span></article>`).join('');
  }

  function renderSeller(config) {
    const seller = config.seller || {};
    const container = $('sellerConfiguration');
    container.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'grid';
    [
      ['Nome do vendedor', seller.name || 'Não configurado (opcional)'],
      ['Conta Mercado Pago', seller.accountConfigured ? 'Configurada no backend' : 'Token/collector ID ausentes'],
      ['Chaves sensíveis', 'Protegidas no Railway'],
    ].forEach(([label, value]) => {
      const card = document.createElement('label');
      card.className = 'card';
      const title = document.createElement('strong');
      title.textContent = label;
      const input = document.createElement('input');
      input.readOnly = true;
      input.value = value;
      card.append(title, input);
      grid.appendChild(card);
    });
    container.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Para habilitar a cobrança automática, configure as variáveis indicadas abaixo no Railway. Não cole tokens ou segredos nesta página.';
    container.appendChild(note);
  }

  function isProductionReady(config) {
    return [...(config.required || []), ...(config.normalPlans || []), ...(config.promotionalPlans || [])]
      .every((item) => item.configured);
  }

  function updateActionState(campaign = lastDashboard?.campaign, productionReady = isProductionReady(lastDashboard?.configuration || {})) {
    const current = campaign || {};
    const active = current.status === 'ACTIVE';
    const exhausted = current.status === 'EXHAUSTED';
    $('openBtn').disabled = loading || !productionReady || active || exhausted;
    $('activateBtn').disabled = loading || !productionReady || active || exhausted;
    $('closeBtn').disabled = loading || !active;
    $('refreshBtn').disabled = loading;
    $('openBtn').title = 'Abre uma campanha DRAFT ou CLOSED após validar a configuração.';
    $('activateBtn').title = 'Valida a configuração de produção e ativa a campanha.';
    $('refreshBtn').title = 'Reconsulta status, configuração, reservas e pagamentos.';
  }

  function renderConfig(config) {
    renderSeller(config);
    const general = (config.required || []).map((item) => `<div>${item.env}: <span class="${item.configured ? 'ok' : 'missing'}">${item.configured ? 'configurado' : 'ausente'}</span></div>`).join('');
    const normal = (config.normalPlans || []).map((item) => `<div>Normal ${item.planSlug}: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">${item.paymentLinkUrl}</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    const promo = (config.promotionalPlans || []).map((item) => `<div>Promo ${item.planSlug}/${item.periodMonths}m: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">link</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    const ready = isProductionReady(config);
    $('configuration').innerHTML = `<div class="muted">${general}</div><hr><div>${normal}</div><hr><div>${promo}</div><p class="muted">Webhook: ${config.webhookPath || '-'}</p>`;
    updateActionState(lastDashboard?.campaign, ready);
    return ready;
  }

  function renderRows(dashboard) {
    $('reservations').innerHTML = (dashboard.reservations || []).map((row) => {
      const metadata = row.metadata || {};
      return `<tr><td>${row.tenant?.name || row.tenantId}</td><td>${metadata.planSlug || '-'} / ${metadata.periodMonths || '-'}m</td><td>${row.status}</td><td>${date(row.reservedAt)}</td><td>${date(row.convertedAt)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhuma reserva.</td></tr>';
    $('payments').innerHTML = (dashboard.payments || []).map((row) => `<tr><td>${row.tenantId}</td><td>${row.status}</td><td>${money(row.amountCents)}</td><td>${row.provider}</td><td>${date(row.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum pagamento.</td></tr>';
  }

  function applyCampaignResult(campaign, message) {
    const previous = lastDashboard?.campaign || {};
    const next = {
      ...previous,
      ...campaign,
      reservedConversions: campaign.reservedCount ?? previous.reservedConversions ?? 0,
      convertedConversions: campaign.convertedCount ?? previous.convertedConversions ?? 0,
      maxConversions: campaign.maxConversions ?? previous.maxConversions ?? 0,
      trialDays: campaign.trialDays ?? previous.trialDays ?? 0,
    };
    const campaignIsOpen = next.status === 'ACTIVE' && next.isOpen !== false;
    next.remainingSlots = campaignIsOpen
      ? Math.max(0, Number(next.maxConversions) - Number(next.reservedConversions) - Number(next.convertedConversions))
      : 0;
    if (lastDashboard) lastDashboard = { ...lastDashboard, campaign: next };
    renderMetrics(next);
    updateActionState(next);
    setStatus(message);
  }

  async function load({ preserveStatus = false, initial = false } = {}) {
    if (loading) return false;
    loading = true;
    updateActionState();
    if (!preserveStatus) setStatus(initial ? 'Validando acesso e carregando painel...' : 'Atualizando painel...');
    const maxAttempts = initial ? 3 : 1;
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const dashboard = await api('dashboard');
          lastDashboard = dashboard;
          renderMetrics(dashboard.campaign);
          const productionReady = renderConfig(dashboard.configuration || {});
          renderRows(dashboard);
          const warnings = Array.isArray(dashboard.warnings) ? [...dashboard.warnings] : [];
          if (!productionReady) warnings.push('Configuração de produção incompleta; abertura e ativação estão bloqueadas.');
          updateActionState(dashboard.campaign, productionReady);
          if (!preserveStatus || warnings.length) {
            setStatus(warnings.length ? `Campanha carregada com alerta: ${warnings.join(' ')}` : `Campanha carregada: ${dashboard.campaign.status}.`, warnings.length > 0);
          }
          return true;
        } catch (error) {
          const retryable = [499, 500, 502, 503, 504].includes(error?.status);
          if (!initial || !retryable || attempt === maxAttempts) throw error;
          setStatus(`Servidor ocupado; tentando carregar novamente (${attempt + 1}/${maxAttempts})...`);
          await new Promise((resolve) => window.setTimeout(resolve, 350 * attempt));
        }
      }
      return false;
    } catch (error) {
      if (!preserveStatus) setStatus(error.message, true);
      return false;
    } finally {
      loading = false;
      updateActionState();
    }
  }

  async function runAction(path, successMessage, body) {
    if (loading) return;
    loading = true;
    updateActionState();
    setStatus('Salvando alteração...');
    try {
      const campaign = await api(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
      applyCampaignResult(campaign, successMessage);
      loading = false;
      const refreshed = await load({ preserveStatus: true });
      if (!refreshed) setStatus(`${successMessage} O status foi aplicado localmente; use Atualizar para consultar os dados completos.`);
    } catch (error) {
      setStatus(error.message, true);
    } finally {
      loading = false;
      updateActionState();
    }
  }

  $('refreshBtn').onclick = () => void load();
  $('openBtn').onclick = () => void runAction('open', 'Campanha aberta com sucesso.');
  $('activateBtn').onclick = () => void runAction('activate', 'Campanha ativada em produção.');
  $('closeBtn').onclick = () => void runAction('close', 'Campanha encerrada com sucesso.', { reason: 'MANUAL_SUPERADMIN' });
  // Nenhuma ação de mutação pode ocorrer antes do primeiro status confiável.
  $('openBtn').disabled = true;
  $('activateBtn').disabled = true;
  $('closeBtn').disabled = true;
  // Aguarda a inicialização da sessão/sidebar e repete falhas transitórias do primeiro GET.
  window.setTimeout(() => void load({ initial: true }), 250);
})();
