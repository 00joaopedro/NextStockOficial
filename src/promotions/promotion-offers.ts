export type PromotionPlanSlug = 'ouro' | 'esmeralda';
export type PromotionPeriodMonths = 1 | 3 | 6;

export type PromotionOffer = {
  campaignSlug: 'lancamento-2026';
  planSlug: PromotionPlanSlug;
  periodMonths: PromotionPeriodMonths;
  chargeAmountCents: number;
  chargeIntervalMonths: PromotionPeriodMonths;
  monthlyPriceCents?: number;
  totalPriceCents: number;
  trialDays: 1;
  paymentLinkUrl: string;
  gatewayPlanEnv: string;
};

type OfferDefinition = Omit<PromotionOffer, 'campaignSlug' | 'trialDays' | 'gatewayPlanEnv' | 'chargeIntervalMonths' | 'monthlyPriceCents'>;

const offers: readonly OfferDefinition[] = [
  { planSlug: 'ouro', periodMonths: 1, chargeAmountCents: 10_000, totalPriceCents: 10_000, paymentLinkUrl: 'https://mpago.la/2M8u6Mo' },
  { planSlug: 'ouro', periodMonths: 3, chargeAmountCents: 20_000, totalPriceCents: 20_000, paymentLinkUrl: 'https://mpago.la/26JiY6w' },
  { planSlug: 'ouro', periodMonths: 6, chargeAmountCents: 40_000, totalPriceCents: 40_000, paymentLinkUrl: 'https://mpago.la/1517nND' },
  { planSlug: 'esmeralda', periodMonths: 1, chargeAmountCents: 20_000, totalPriceCents: 20_000, paymentLinkUrl: 'https://mpago.la/2NKAhiw' },
  { planSlug: 'esmeralda', periodMonths: 3, chargeAmountCents: 60_000, totalPriceCents: 60_000, paymentLinkUrl: 'https://mpago.la/33JYezV' },
  { planSlug: 'esmeralda', periodMonths: 6, chargeAmountCents: 120_000, totalPriceCents: 120_000, paymentLinkUrl: 'https://mpago.la/13xA3wN' },
];

export const PROMOTION_OFFERS = offers.map((offer) => ({
  campaignSlug: 'lancamento-2026' as const,
  ...offer,
  chargeIntervalMonths: offer.periodMonths,
  trialDays: 1 as const,
  gatewayPlanEnv: `MERCADO_PAGO_PROMO_PLAN_ID_${offer.planSlug.toUpperCase()}_${offer.periodMonths}`,
}));

export function getPromotionOffer(
  planSlug: string | undefined,
  periodMonths: number | undefined,
): PromotionOffer | null {
  return (
    PROMOTION_OFFERS.find(
      (offer) =>
        offer.planSlug === planSlug && offer.periodMonths === periodMonths,
    ) ?? null
  );
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

export const NORMAL_PAYMENT_LINKS = {
  ouro: 'https://mpago.la/1AFwduc',
  esmeralda: 'https://mpago.la/31d6g5z',
  diamante: 'https://mpago.la/2Kcwkre',
} as const;

export const NORMAL_PLAN_ID_ENVS = {
  ouro: 'MERCADO_PAGO_PLAN_ID_OURO',
  esmeralda: 'MERCADO_PAGO_PLAN_ID_ESMERALDA',
  diamante: 'MERCADO_PAGO_PLAN_ID_DIAMANTE',
} as const;

/** Keep the exact terms of reservations created before per-period billing. */
export function getReservedPromotionOffer(metadata: unknown): PromotionOffer | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const {
    planSlug, periodMonths, chargeAmountCents, chargeIntervalMonths,
    monthlyPriceCents, totalPriceCents,
  } = metadata as Record<string, unknown>;
  const offer = getPromotionOffer(
    typeof planSlug === 'string' ? planSlug : undefined,
    typeof periodMonths === 'number' ? periodMonths : undefined,
  );
  if (!offer) return null;

  if (chargeAmountCents !== undefined || chargeIntervalMonths !== undefined) {
    if (
      chargeIntervalMonths !== offer.periodMonths ||
      typeof chargeAmountCents !== 'number' || !Number.isSafeInteger(chargeAmountCents) ||
      chargeAmountCents <= 0 || totalPriceCents !== chargeAmountCents ||
      monthlyPriceCents !== undefined
    ) return null;
    return { ...offer, chargeAmountCents, totalPriceCents: chargeAmountCents };
  }

  // Early reservations only stored the plan and period. Reconstruct the old
  // monthly terms instead of silently applying the new catalog to them.
  const legacyMonthly = monthlyPriceCents === undefined && totalPriceCents === undefined
    ? (offer.planSlug === 'esmeralda' ? 20_000 : offer.periodMonths === 1 ? 10_000 : 6_666)
    : monthlyPriceCents;
  if (
    typeof legacyMonthly !== 'number' || !Number.isSafeInteger(legacyMonthly) ||
    legacyMonthly <= 0
  ) return null;
  const legacyTotal = legacyMonthly * offer.periodMonths;
  if (!Number.isSafeInteger(legacyTotal) ||
      (totalPriceCents !== legacyTotal &&
       !(totalPriceCents === undefined && monthlyPriceCents === undefined))) return null;
  return {
    ...offer, chargeAmountCents: legacyMonthly, chargeIntervalMonths: 1,
    monthlyPriceCents: legacyMonthly, totalPriceCents: legacyTotal,
  };
}
