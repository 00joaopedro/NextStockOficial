import { getPromotionOffer } from './promotion-offers';

describe('promotion offer catalog', () => {
  it('contains the six server-controlled offers', () => {
    const plans = ['ouro', 'esmeralda'];
    const periods = [1, 3, 6];

    for (const plan of plans) {
      for (const period of periods) {
        const offer = getPromotionOffer(plan, period);
        expect(offer).toMatchObject({
          campaignSlug: 'lancamento-2026',
          planSlug: plan,
          periodMonths: period,
          trialDays: 1,
        });
        expect(offer?.monthlyPriceCents).toBeGreaterThan(0);
        expect(offer?.totalPriceCents).toBeGreaterThan(0);
        expect(offer?.paymentLinkUrl).toContain('https://mpago.la/');
      }
    }
  });

  it('rejects arbitrary slugs, periods and incomplete offers', () => {
    expect(getPromotionOffer('free', 1)).toBeNull();
    expect(getPromotionOffer('diamante', 1)).toBeNull();
    expect(getPromotionOffer('ouro', 8)).toBeNull();
    expect(getPromotionOffer('ouro', undefined)).toBeNull();
    expect(getPromotionOffer(undefined, 3)).toBeNull();
  });
});
