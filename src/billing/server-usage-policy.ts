// Same limit for promotional and regular subscriptions, in BRL cents.
// A future change must specify which billing cycles the new limits apply to.
export const SERVER_USAGE_LIMIT_CENTS_BY_PLAN: Readonly<Record<string, number>> = {
  ouro: 2_500,
  esmeralda: 5_000,
  diamante: 15_000,
};

export function serverUsageLimitCents(planSlug?: string | null): number | null {
  if (!planSlug) return null;
  return SERVER_USAGE_LIMIT_CENTS_BY_PLAN[planSlug] ?? null;
}
