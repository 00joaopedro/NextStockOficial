(() => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref') || '';
  const status = document.getElementById('status');
  const modes = document.getElementById('modes');
  const allowed = ['padrao', 'petshop'];
  const labels = { padrao: 'Sistema padrão', petshop: 'Pet Shop' };

  const showError = (message) => {
    status.textContent = message;
    status.classList.remove('hidden');
    modes.replaceChildren();
  };

  const linkFor = (mode, promotion) => {
    const target = promotion ? 'promocao.html' : 'index.html';
    const query = new URLSearchParams({ ref, systemType: mode });
    if (!promotion) query.set('promo', 'none');
    return './' + target + '?' + query.toString() + (promotion ? '' : '#cadastro');
  };

  const render = (modesAllowed) => {
    modes.replaceChildren();
    for (const mode of modesAllowed) {
      const card = document.createElement('article');
      card.className = 'mode';
      card.innerHTML = '<h2>' + labels[mode] + '</h2><p class="muted">Venda e cadastro neste modo.</p>';
      const normal = document.createElement('button');
      normal.type = 'button';
      normal.textContent = 'Cadastro sem promoção';
      normal.onclick = () => { window.location.href = linkFor(mode, false); };
      const promotion = document.createElement('button');
      promotion.type = 'button';
      promotion.className = 'secondary';
      promotion.textContent = 'Ver promoção';
      promotion.onclick = () => { window.location.href = linkFor(mode, true); };
      card.append(normal, promotion);
      modes.appendChild(card);
    }
  };

  if (!/^[A-Za-z0-9_-]{32,128}$/.test(ref)) {
    showError('Link de indicação inválido ou indisponível.');
    return;
  }

  fetch('/api/referrals/' + encodeURIComponent(ref) + '/context', {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.valid !== true) throw new Error('invalid');
      const modesAllowed = Array.isArray(data.allowedSystemTypes)
        ? data.allowedSystemTypes.filter((mode) => allowed.includes(mode))
        : data.systemType && allowed.includes(data.systemType) ? [data.systemType] : [];
      if (!modesAllowed.length) throw new Error('invalid');
      render(modesAllowed);
    })
    .catch(() => showError('Link de indicação inválido ou indisponível.'));
})();
