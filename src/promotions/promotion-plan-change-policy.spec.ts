import { promotionChangeOptions } from './promotion-plan-change-policy';

describe('promotion change selection', () => {
  const end = new Date('2027-05-01T12:00:00Z');
  const base = {
    promotionalPeriodEndsAt: end,
    currentPlan: 'ouro' as const,
    esmeraldaUsageCents: null,
    esmeraldaLimitCents: 5000,
  };
  it('blocks before the agreed promotional period ends', () => {
    expect(
      promotionChangeOptions({
        ...base,
        now: new Date('2027-05-01T11:59:59Z'),
      }),
    ).toMatchObject({
      available: false,
      code: 'PROMOTIONAL_PERIOD_ACTIVE',
      options: [],
    });
  });
  it('allows an existing promotional customer to select Esmeralda without checking campaign capacity', () => {
    expect(promotionChangeOptions({ ...base, now: end })).toMatchObject({
      available: true,
      options: ['esmeralda_promocional'],
    });
  });
  it('offers normal Diamante when Esmeralda reaches the usage limit', () => {
    expect(
      promotionChangeOptions({
        ...base,
        now: end,
        currentPlan: 'esmeralda',
        esmeraldaUsageCents: 5000,
      }),
    ).toMatchObject({ available: true, options: ['diamante_normal'] });
    expect(
      promotionChangeOptions({
        ...base,
        now: end,
        currentPlan: 'esmeralda',
        esmeraldaUsageCents: 4999,
      }).available,
    ).toBe(false);
  });
  it('does not infer an unavailable period or usage', () => {
    expect(
      promotionChangeOptions({
        ...base,
        promotionalPeriodEndsAt: null,
        now: end,
      }).available,
    ).toBe(false);
    expect(
      promotionChangeOptions({ ...base, now: end, currentPlan: 'esmeralda' })
        .code,
    ).toBe('USAGE_UNAVAILABLE');
  });
});
