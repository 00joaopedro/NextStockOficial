import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'node:vm';

describe('promotion campaign frontend', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'promocao.html'),
    'utf8',
  );
  const promotionScript = readFileSync(
    join(process.cwd(), 'public', 'Js', 'promocao.js'),
    'utf8',
  );
  const signupScript = readFileSync(
    join(process.cwd(), 'public', 'Js', 'csp-extracted', 'index-inline1.js'),
    'utf8',
  );
  const profileScript = readFileSync(
    join(process.cwd(), 'public', 'Js', 'perfil.js'),
    'utf8',
  );

  it('oferece as seis combinações de plano e período', () => {
    expect(html.match(/data-promotion-choice/g)).toHaveLength(6);
    expect(html).toContain('id="campaignStatus"');
    expect(html).not.toContain('href="#comprar"');
    expect(html).toContain('Js/promocao.js');
  });

  it('consulta a campanha e bloqueia escolhas por padrão', () => {
    expect(promotionScript).toContain('/api/promotions/');
    expect(promotionScript).toContain('encodeURIComponent(CAMPAIGN_SLUG)');
    expect(promotionScript).toContain('disableChoices(true)');
    expect(promotionScript).toContain('context.isOpen !== true');
    expect(promotionScript).toContain('button.disabled = disabled');
    expect(promotionScript).toContain('nextstockPromotionAttribution');
  });

  it('atualiza as vagas ao voltar para a página e enquanto ela está visível', async () => {
    const status = { textContent: '' };
    const choice = {
      disabled: false,
      setAttribute: jest.fn(),
      addEventListener: jest.fn(),
    };
    const document = {
      hidden: false,
      getElementById: () => status,
      querySelectorAll: () => [choice],
      addEventListener: jest.fn(),
    };
    const window = {
      location: { search: '' },
      addEventListener: jest.fn(),
      setInterval: jest.fn(),
      setTimeout: jest.fn(),
      clearTimeout: jest.fn(),
    };
    const response = (remainingSlots: number) => ({
      ok: true,
      json: async () => ({
        status: 'ACTIVE',
        isOpen: remainingSlots > 0,
        remainingSlots,
      }),
    });
    const fetch = jest
      .fn()
      .mockResolvedValueOnce(response(30))
      .mockResolvedValueOnce(response(29))
      .mockResolvedValueOnce(response(0));
    const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
    runInNewContext(promotionScript, {
      document,
      window,
      fetch,
      AbortController,
      URLSearchParams,
      localStorage: { getItem: () => null },
    });

    await flush();
    expect(status.textContent).toContain('30 vaga(s)');
    expect(choice.disabled).toBe(false);
    expect(fetch).toHaveBeenCalledWith(
      '/api/promotions/lancamento-2026/context',
      expect.objectContaining({ cache: 'no-store' }),
    );

    const onPageShow = window.addEventListener.mock.calls.find(
      ([name]) => name === 'pageshow',
    )![1] as (event: { persisted: boolean }) => void;
    onPageShow({ persisted: true });
    await flush();
    expect(status.textContent).toContain('29 vaga(s)');

    const tick = window.setInterval.mock.calls[0][0] as () => void;
    document.hidden = true;
    tick();
    expect(fetch).toHaveBeenCalledTimes(2);
    document.hidden = false;
    tick();
    await flush();
    expect(status.textContent).toContain('sem vagas disponíveis');
    expect(choice.disabled).toBe(true);
  });

  it('preserva afiliado e oferta até o cadastro e reserva autenticada', () => {
    expect(promotionScript).toContain(
      "params.set('ref', selection.referralCode)",
    );
    expect(promotionScript).toContain('sessionStorage.setItem(SELECTION_KEY');
    expect(signupScript).toContain('referralCode');
    expect(signupScript).toContain(
      "/promotions/' + encodeURIComponent(selection.campaignSlug) + '/reservation",
    );
    expect(signupScript).toContain('planSlug: selection.planSlug');
    expect(signupScript).toContain('periodMonths: selection.periodMonths');
    expect(signupScript).toContain('Idempotency-Key');
    expect(signupScript).toContain('perfil.html?promotionCheckout=1');
  });

  it('usa a capacidade retornada pela API e oferece configuração apenas no painel admin', () => {
    const adminHtml = readFileSync(
      join(process.cwd(), 'public', 'promocao-admin.html'),
      'utf8',
    );
    const adminScript = readFileSync(
      join(process.cwd(), 'public', 'Js', 'promocao-admin.js'),
      'utf8',
    );
    expect(promotionScript).toContain('context?.maxConversions || 0');
    expect(promotionScript).not.toContain('As 30 vagas promocionais');
    expect(adminHtml).toContain('id="maxConversionsInput"');
    expect(adminHtml).toContain('id="saveCapacityBtn"');
    expect(adminScript).toContain("runAction('capacity'");
    expect(adminScript).toContain('ATUALIZAR VAGAS');
    expect(adminScript).toContain(
      "headers: idempotencyKey\n          ? { 'Idempotency-Key': idempotencyKey }",
    );
    expect(adminScript).not.toContain('idempotencyKey: crypto.randomUUID()');
  });

  it('exibe a oferta no perfil e encaminha ao checkout existente', () => {
    expect(profileScript).toContain('promotionSelection()');
    expect(profileScript).toContain('Oferta promocional selecionada');
    expect(profileScript).toContain('startCheckout(plan.slug)');
    expect(profileScript).toContain('selected.periodMonths');
    expect(profileScript).toContain('promotionReservationId');
    expect(profileScript).toContain(
      'A oferta promocional ainda não possui uma reserva válida.',
    );
  });
});
