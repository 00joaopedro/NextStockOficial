import { readFileSync } from 'fs';
import { join } from 'path';

describe('promotion campaign frontend', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'promocao.html'), 'utf8');
  const promotionScript = readFileSync(join(process.cwd(), 'public', 'Js', 'promocao.js'), 'utf8');
  const signupScript = readFileSync(join(process.cwd(), 'public', 'Js', 'csp-extracted', 'index-inline1.js'), 'utf8');
  const profileScript = readFileSync(join(process.cwd(), 'public', 'Js', 'perfil.js'), 'utf8');

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

  it('preserva afiliado e oferta até o cadastro e reserva autenticada', () => {
    expect(promotionScript).toContain("params.set('ref', selection.referralCode)");
    expect(promotionScript).toContain('sessionStorage.setItem(SELECTION_KEY');
    expect(signupScript).toContain('referralCode');
    expect(signupScript).toContain("/promotions/' + encodeURIComponent(selection.campaignSlug) + '/reservation");
    expect(signupScript).toContain('planSlug: selection.planSlug');
    expect(signupScript).toContain('periodMonths: selection.periodMonths');
    expect(signupScript).toContain('Idempotency-Key');
    expect(signupScript).toContain('perfil.html?promotionCheckout=1');
  });

  it('exibe a oferta no perfil e encaminha ao checkout existente', () => {
    expect(profileScript).toContain('promotionSelection()');
    expect(profileScript).toContain('Oferta promocional selecionada');
    expect(profileScript).toContain('startCheckout(plan.slug)');
    expect(profileScript).toContain('selected.periodMonths');
    expect(profileScript).toContain('promotionReservationId');
    expect(profileScript).toContain('A oferta promocional ainda não possui uma reserva válida.');
  });
});
