import { getPromotionOffer, getReservedPromotionOffer } from './promotion-offers';

describe('promotion offer catalog', () => {
  it.each([
    ['ouro', 1, 10_000],
    ['ouro', 3, 20_000],
    ['ouro', 6, 40_000],
    ['esmeralda', 1, 20_000],
    ['esmeralda', 3, 60_000],
    ['esmeralda', 6, 120_000],
  ])('charges %s every %i month(s) at %i cents', (planSlug, periodMonths, amount) => {
    const offer = getPromotionOffer(planSlug, periodMonths);
    expect(offer).toMatchObject({
      planSlug, periodMonths, chargeAmountCents: amount,
      chargeIntervalMonths: periodMonths, totalPriceCents: amount, trialDays: 1,
      paymentLinkUrl: expect.stringMatching(/^https:\/\/mpago\.la\//),
    });
    expect(getReservedPromotionOffer(offer)).toEqual(offer);
  });

  it('preserves old monthly terms even when no price was snapshotted', () => {
    expect(getReservedPromotionOffer({ planSlug: 'ouro', periodMonths: 6 }))
      .toMatchObject({ chargeAmountCents: 6666, chargeIntervalMonths: 1, totalPriceCents: 39996 });
  });

  it('rejects snapshots with mismatched totals or billing intervals', () => {
    const terms = { planSlug: 'ouro', periodMonths: 3, chargeAmountCents: 20000 };
    expect(getReservedPromotionOffer({ ...terms, totalPriceCents: 20000, chargeIntervalMonths: 1 })).toBeNull();
    expect(getReservedPromotionOffer({ ...terms, totalPriceCents: 19998, chargeIntervalMonths: 3 })).toBeNull();
  });

  it('rejects arbitrary slugs, periods and incomplete offers', () => {
    expect(getPromotionOffer('free', 1)).toBeNull();
    expect(getPromotionOffer('diamante', 1)).toBeNull();
    expect(getPromotionOffer('ouro', 8)).toBeNull();
    expect(getPromotionOffer('ouro', undefined)).toBeNull();
    expect(getPromotionOffer(undefined, 3)).toBeNull();
  });
});
