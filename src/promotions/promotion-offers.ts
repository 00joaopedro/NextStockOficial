export type PromotionPlanSlug = 'ouro' | 'esmeralda';
export type PromotionPeriodMonths = 1 | 3 | 6;

export type PromotionOffer = {
  campaignSlug: 'lancamento-2026';
  planSlug: PromotionPlanSlug;
  periodMonths: PromotionPeriodMonths;
  monthlyPriceCents: number;
  totalPriceCents: number;
  trialDays: 1;
  paymentLinkUrl: string;
  gatewayPlanEnv: string;
};

type OfferDefinition = Omit<PromotionOffer, 'campaignSlug' | 'trialDays' | 'gatewayPlanEnv'>;

const offers: readonly OfferDefinition[] = [
  { planSlug: 'ouro', periodMonths: 1, monthlyPriceCents: 10_000, totalPriceCents: 10_000, paymentLinkUrl: 'https://mpago.la/2M8u6Mo' },
  { planSlug: 'ouro', periodMonths: 3, monthlyPriceCents: 6_667, totalPriceCents: 20_000, paymentLinkUrl: 'https://mpago.la/26JiY6w' },
  { planSlug: 'ouro', periodMonths: 6, monthlyPriceCents: 6_667, totalPriceCents: 40_000, paymentLinkUrl: 'https://mpago.la/1517nND' },
  { planSlug: 'esmeralda', periodMonths: 1, monthlyPriceCents: 20_000, totalPriceCents: 20_000, paymentLinkUrl: 'https://mpago.la/2NKAhiw' },
  { planSlug: 'esmeralda', periodMonths: 3, monthlyPriceCents: 20_000, totalPriceCents: 60_000, paymentLinkUrl: 'https://mpago.la/33JYezV' },
  { planSlug: 'esmeralda', periodMonths: 6, monthlyPriceCents: 20_000, totalPriceCents: 120_000, paymentLinkUrl: 'https://mpago.la/13xA3wN' },
];

export const PROMOTION_OFFERS = offers.map((offer) => ({
  campaignSlug: 'lancamento-2026' as const,
  ...offer,
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
