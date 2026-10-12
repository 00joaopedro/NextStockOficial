(() => {
  const slug = 'lancamento-2026';
  const $ = (id) => document.getElementById(id);
  const status = $('status');
  const money = (cents) => cents == null ? '-' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';
  function setStatus(message, error = false) { status.textContent = message; status.className = `status${error ? ' error' : ''}`; }
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 60000);
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
        const detail = Array.isArray(body.message)
          ? body.message.join(' ')
          : body.message;
        throw new Error(detail || `Falha no painel (HTTP ${response.status}).`);
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
    $('metrics').innerHTML = [
      ['Status', c.status], ['Vagas', `${c.convertedConversions}/${c.maxConversions}`],
      ['Reservas ativas', c.reservedConversions], ['Vagas restantes', c.remainingSlots],
      ['Trial promocional', `${c.trialDays} dia`]
    ].map(([label,value]) => `<article class="card metric"><strong>${label}</strong><span>${value}</span></article>`).join('');
  }
  function renderSeller(config) {
    const seller = config.seller || {};
    const container = $('sellerConfiguration');
    container.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'grid';
    const fields = [
      ['Nome do vendedor', seller.name || 'Não configurado (opcional)'],
      ['Conta Mercado Pago', seller.accountConfigured ? 'Configurada no backend' : 'Token/collector ID ausentes'],
      ['Chaves sensíveis', 'Protegidas no Railway'],
    ];

    for (const [label, value] of fields) {
      const card = document.createElement('label');
      card.className = 'card';
      const title = document.createElement('strong');
      title.textContent = label;
      const input = document.createElement('input');
      input.readOnly = true;
      input.value = value;
      card.append(title, input);
      grid.appendChild(card);
    }

    container.appendChild(grid);
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Para habilitar a cobrança automática, configure as variáveis indicadas abaixo no Railway. Não cole tokens ou segredos nesta página.';
    container.appendChild(note);
  }
  function renderConfig(config) {
    renderSeller(config);
    const general = config.required.map(item => `<div>${item.env}: <span class="${item.configured ? 'ok' : 'missing'}">${item.configured ? 'configurado' : 'ausente'}</span></div>`).join('');
    const normal = config.normalPlans.map(item => `<div>Normal ${item.planSlug}: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">${item.paymentLinkUrl}</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    const promo = config.promotionalPlans.map(item => `<div>Promo ${item.planSlug}/${item.periodMonths}m: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">link</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    const ready = [...config.required, ...config.normalPlans, ...config.promotionalPlans].every(item => item.configured);
    $('openBtn').disabled = !ready;
    $('activateBtn').disabled = !ready;
    $('configuration').innerHTML = `<div class="muted">${general}</div><hr><div>${normal}</div><hr><div>${promo}</div><p class="muted">Webhook: ${config.webhookPath}</p>`;
    return ready;
  }
  function renderRows(d) {
    $('reservations').innerHTML = d.reservations.map(row => {
      const metadata = row.metadata || {};
      return `<tr><td>${row.tenant?.name || row.tenantId}</td><td>${metadata.planSlug || '-'} / ${metadata.periodMonths || '-'}m</td><td>${row.status}</td><td>${date(row.reservedAt)}</td><td>${date(row.convertedAt)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhuma reserva.</td></tr>';
    $('payments').innerHTML = d.payments.map(row => `<tr><td>${row.tenantId}</td><td>${row.status}</td><td>${money(row.amountCents)}</td><td>${row.provider}</td><td>${date(row.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum pagamento.</td></tr>';
  }
  async function load() {
    try { const dashboard = await api('dashboard'); renderMetrics(dashboard.campaign); const productionReady = renderConfig(dashboard.configuration); renderRows(dashboard); const warnings = Array.isArray(dashboard.warnings) ? dashboard.warnings : []; if (!productionReady) warnings.push('Configuração de produção incompleta; abertura e ativação estão bloqueadas.'); setStatus(warnings.length ? `Campanha carregada com alerta: ${warnings.join(' ')}` : `Campanha carregada: ${dashboard.campaign.status}.`, warnings.length > 0); }
    catch (error) { setStatus(error.message, true); }
  }
  $('refreshBtn').onclick = load;
  $('openBtn').onclick = async () => { try { await api('open', { method: 'POST' }); await load(); } catch (e) { setStatus(e.message, true); } };
  $('activateBtn').onclick = async () => { try { await api('activate', { method: 'POST' }); await load(); } catch (e) { setStatus(e.message, true); } };
  $('closeBtn').onclick = async () => { try { await api('close', { method: 'POST', body: JSON.stringify({ reason: 'MANUAL_SUPERADMIN' }) }); await load(); } catch (e) { setStatus(e.message, true); } };
  load();
})();
