(() => {
  const CAMPAIGN_SLUG = 'lancamento-2026';
  const SELECTION_KEY = 'nextstockPromotionSelection';
  const ATTRIBUTION_KEY = 'nextstockPromotionAttribution';
  const ATTRIBUTION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const REFERRAL_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

  const status = document.getElementById('campaignStatus');
  const buttons = Array.from(
    document.querySelectorAll('[data-promotion-choice]'),
  );

  function setStatus(message, type = '') {
    if (!status) return;
    status.textContent = message;
    status.className = `campaign-status${type ? ` ${type}` : ''}`;
  }

  function validReferral(value) {
    return typeof value === 'string' && REFERRAL_PATTERN.test(value);
  }

  function queryReferral() {
    const value = new URLSearchParams(window.location.search).get('ref');
    return validReferral(value) ? value : null;
  }

  function storedReferral() {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(ATTRIBUTION_KEY) || 'null',
      );
      if (
        parsed &&
        validReferral(parsed.code) &&
        parsed.campaignSlug === CAMPAIGN_SLUG &&
        Date.now() - Number(parsed.capturedAt) <= ATTRIBUTION_TTL_MS
      ) {
        return parsed.code;
      }
    } catch {}
    return null;
  }

  function referralCode() {
    const current = queryReferral();
    if (current) {
      localStorage.setItem(
        ATTRIBUTION_KEY,
        JSON.stringify({
          code: current,
          campaignSlug: CAMPAIGN_SLUG,
          capturedAt: Date.now(),
        }),
      );
      return current;
    }
    return storedReferral();
  }

  function disableChoices(disabled) {
    for (const button of buttons) {
      button.disabled = disabled;
      button.setAttribute('aria-disabled', String(disabled));
    }
  }

  function rememberChoice(button, ref) {
    const selection = {
      campaignSlug: CAMPAIGN_SLUG,
      planSlug: button.dataset.plan,
      periodMonths: Number(button.dataset.period),
      referralCode: ref,
      selectedAt: new Date().toISOString(),
    };
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(selection));
    return selection;
  }

  function signupUrl(selection) {
    const params = new URLSearchParams({
      promo: selection.campaignSlug,
      plan: selection.planSlug,
      period: String(selection.periodMonths),
    });
    if (selection.referralCode) {
      params.set('ref', selection.referralCode);
    }
    return `/index.html?${params.toString()}#cadastro`;
  }

  async function loadCampaign() {
    disableChoices(true);
    try {
      const response = await fetch(
        `/api/promotions/${encodeURIComponent(CAMPAIGN_SLUG)}/context`,
        { credentials: 'same-origin', headers: { Accept: 'application/json' } },
      );
      const context = await response.json().catch(() => ({}));
      if (!response.ok || !context || context.isOpen !== true) {
        const reason =
          context?.status === 'DRAFT'
            ? 'A promoção ainda não foi aberta.'
            : context?.status === 'EXHAUSTED'
              ? 'As 30 vagas promocionais já foram preenchidas.'
              : 'A promoção está encerrada no momento.';
        setStatus(`${reason} Os botões foram bloqueados.`, 'error');
        return;
      }

      const slots = Number(context.remainingSlots || 0);
      if (slots <= 0) {
        setStatus('A promoção está sem vagas disponíveis no momento. Os botões foram bloqueados.', 'error');
        return;
      }
      setStatus(
        `Promoção ativa: ${slots} vaga(s) disponível(is). Escolha uma oferta para continuar o cadastro.`,
        'success',
      );
      disableChoices(false);
    } catch {
      setStatus(
        'Não foi possível confirmar a disponibilidade da promoção. Os botões foram bloqueados por segurança.',
        'error',
      );
    }
  }

  const ref = referralCode();
  for (const button of buttons) {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const selection = rememberChoice(button, ref);
      window.location.assign(signupUrl(selection));
    });
  }

  loadCampaign();
})();
