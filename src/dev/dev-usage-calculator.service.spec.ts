import { DevUsageCalculatorService } from './dev-usage-calculator.service';

describe('DevUsageCalculatorService', () => {
  it('calcula rateio por peso', () => {
    const service = new DevUsageCalculatorService();

    expect(
      service.estimateForUser({
        userWeight: 25,
        totalWeight: 100,
        railwayTotalUnits: 200,
        supabaseTotalUnits: 400,
        railwayCostCents: 1000,
        supabaseCostCents: 2000,
      }),
    ).toMatchObject({
      sharePercent: 25,
      railway: { units: 50, costCents: 250 },
      supabase: { units: 100, costCents: 500 },
      estimatedCostCents: 750,
    });
  });
});
