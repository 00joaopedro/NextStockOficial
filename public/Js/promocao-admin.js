(() => {
  const slug = 'lancamento-2026';
  const $ = (id) => document.getElementById(id);
  const status = $('status');
  const money = (cents) => cents == null ? '-' : (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (value) => value ? new Date(value).toLocaleString('pt-BR') : '-';
  function setStatus(message, error = false) { status.textContent = message; status.className = `status${error ? ' error' : ''}`; }
  async function api(path, options = {}) {
    const response = await fetch(`/api/promotions/admin/${encodeURIComponent(slug)}/${path}`, { credentials: 'same-origin', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) }, ...options });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'Operação não autorizada.');
    return body;
  }
  function renderMetrics(c) {
    $('metrics').innerHTML = [
      ['Status', c.status], ['Vagas', `${c.convertedConversions}/${c.maxConversions}`],
      ['Reservas ativas', c.reservedConversions], ['Vagas restantes', c.remainingSlots],
      ['Trial promocional', `${c.trialDays} dia`]
    ].map(([label,value]) => `<article class="card metric"><strong>${label}</strong><span>${value}</span></article>`).join('');
  }
  function renderConfig(config) {
    const general = config.required.map(item => `<div>${item.env}: <span class="${item.configured ? 'ok' : 'missing'}">${item.configured ? 'configurado' : 'ausente'}</span></div>`).join('');
    const normal = config.normalPlans.map(item => `<div>Normal ${item.planSlug}: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">${item.paymentLinkUrl}</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    const promo = config.promotionalPlans.map(item => `<div>Promo ${item.planSlug}/${item.periodMonths}m: <a href="${item.paymentLinkUrl}" target="_blank" rel="noopener">link</a> · <span class="${item.configured ? 'ok' : 'missing'}">ID ${item.configured ? 'OK' : 'ausente'}</span></div>`).join('');
    $('configuration').innerHTML = `<div class="muted">${general}</div><hr><div>${normal}</div><hr><div>${promo}</div><p class="muted">Webhook: ${config.webhookPath}</p>`;
  }
  function renderRows(d) {
    $('reservations').innerHTML = d.reservations.map(row => {
      const metadata = row.metadata || {};
      return `<tr><td>${row.tenant?.name || row.tenantId}</td><td>${metadata.planSlug || '-'} / ${metadata.periodMonths || '-'}m</td><td>${row.status}</td><td>${date(row.reservedAt)}</td><td>${date(row.convertedAt)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">Nenhuma reserva.</td></tr>';
    $('payments').innerHTML = d.payments.map(row => `<tr><td>${row.tenantId}</td><td>${row.status}</td><td>${money(row.amountCents)}</td><td>${row.provider}</td><td>${date(row.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum pagamento.</td></tr>';
  }
  async function load() {
    try { const dashboard = await api('dashboard'); renderMetrics(dashboard.campaign); renderConfig(dashboard.configuration); renderRows(dashboard); setStatus(`Campanha carregada: ${dashboard.campaign.status}.`); }
    catch (error) { setStatus(error.message, true); }
  }
  $('refreshBtn').onclick = load;
  $('openBtn').onclick = async () => { try { await api('open', { method: 'POST' }); await load(); } catch (e) { setStatus(e.message, true); } };
  $('activateBtn').onclick = async () => { try { await api('activate', { method: 'POST' }); await load(); } catch (e) { setStatus(e.message, true); } };
  $('closeBtn').onclick = async () => { try { await api('close', { method: 'POST', body: JSON.stringify({ reason: 'MANUAL_SUPERADMIN' }) }); await load(); } catch (e) { setStatus(e.message, true); } };
  load();
})();
