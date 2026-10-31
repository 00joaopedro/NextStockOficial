import { promotionChangeOptions } from './promotion-plan-change-policy';

describe('promotion change selection', () => {
  const end = new Date('2027-05-01T12:00:00Z');
  it('blocks during the current promotional commitment', () => {
    expect(
      promotionChangeOptions({
        promotionalPeriodEndsAt: end,
        now: new Date('2027-05-01T11:59:59Z'),
        esmeraldaPromotionAvailable: true,
      }),
    ).toMatchObject({
      available: false,
      code: 'PROMOTIONAL_PERIOD_ACTIVE',
      options: [],
    });
  });
  it('offers Esmeralda if capacity is verified at the end', () => {
    expect(
      promotionChangeOptions({
        promotionalPeriodEndsAt: end,
        now: end,
        esmeraldaPromotionAvailable: true,
      }),
    ).toMatchObject({ available: true, options: ['esmeralda_promocional'] });
  });
  it('presents Diamante as a choice when the promotional capacity is exhausted', () => {
    expect(
      promotionChangeOptions({
        promotionalPeriodEndsAt: end,
        now: end,
        esmeraldaPromotionAvailable: false,
      }),
    ).toMatchObject({ available: true, options: ['diamante_normal'] });
  });
  it('fails closed for unknown end or capacity', () => {
    expect(
      promotionChangeOptions({
        promotionalPeriodEndsAt: null,
        now: end,
        esmeraldaPromotionAvailable: true,
      }).available,
    ).toBe(false);
    expect(
      promotionChangeOptions({
        promotionalPeriodEndsAt: end,
        now: end,
        esmeraldaPromotionAvailable: null,
      }).available,
    ).toBe(false);
  });
});
