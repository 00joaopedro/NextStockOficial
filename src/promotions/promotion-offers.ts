export type PromotionPlanSlug = 'ouro' | 'esmeralda' | 'diamante';
export type PromotionPeriodMonths = 8 | 12 | 24;

export type PromotionOffer = {
  campaignSlug: 'lancamento-2026';
  planSlug: PromotionPlanSlug;
  periodMonths: PromotionPeriodMonths;
  monthlyPriceCents: number;
  totalPriceCents: number;
  trialDays: 1;
  gatewayPlanEnv: string;
};

const monthlyPrices: Record<PromotionPlanSlug, number> = {
  ouro: 5_000,
  esmeralda: 20_000,
  diamante: 30_000,
};

const periods = [8, 12, 24] as const;

export function getPromotionOffer(
  planSlug: string | undefined,
  periodMonths: number | undefined,
): PromotionOffer | null {
  if (
    !['ouro', 'esmeralda', 'diamante'].includes(planSlug || '') ||
    !periods.includes(periodMonths as (typeof periods)[number])
  ) {
    return null;
  }

  const plan = planSlug as PromotionPlanSlug;
  const period = periodMonths as PromotionPeriodMonths;
  const monthlyPriceCents = monthlyPrices[plan];

  return {
    campaignSlug: 'lancamento-2026',
    planSlug: plan,
    periodMonths: period,
    monthlyPriceCents,
    totalPriceCents: monthlyPriceCents * period,
    trialDays: 1,
    gatewayPlanEnv: `MERCADO_PAGO_PROMO_PLAN_ID_${plan.toUpperCase()}_${period}`,
  };
}

export function promotionOfferMatches(
  offer: PromotionOffer | null,
  planSlug: string | undefined,
  periodMonths: number | undefined,
) {
  return Boolean(
    offer &&
      offer.planSlug === planSlug &&
      offer.periodMonths === periodMonths,
  );
}
