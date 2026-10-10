import { getPromotionOffer } from './promotion-offers';

describe('promotion offer catalog', () => {
  it('contains the nine server-controlled offers', () => {
    const plans = ['ouro', 'esmeralda', 'diamante'];
    const periods = [8, 12, 24];

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
        expect(offer?.totalPriceCents).toBe(
          (offer?.monthlyPriceCents || 0) * period,
        );
      }
    }
  });

  it('rejects arbitrary slugs, periods and incomplete offers', () => {
    expect(getPromotionOffer('free', 8)).toBeNull();
    expect(getPromotionOffer('ouro', 6)).toBeNull();
    expect(getPromotionOffer('ouro', undefined)).toBeNull();
    expect(getPromotionOffer(undefined, 12)).toBeNull();
  });
});
