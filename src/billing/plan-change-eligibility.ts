import { serverUsageLimitCents } from './server-usage-policy';

/** No partial interval, rounded percentage or missing data may authorize a downgrade. */
export function checkPlanChangeEligibility(input: {
  currentSlug: string | null | undefined;
  targetSlug: string;
  lastCompleteCycleCostCents: number | null;
}) {
  const currentLimit = serverUsageLimitCents(input.currentSlug);
  const targetLimit = serverUsageLimitCents(input.targetSlug);
  if (currentLimit == null || targetLimit == null) return 'PLAN_LIMIT_UNAVAILABLE' as const;
  if (targetLimit >= currentLimit) return 'ELIGIBLE' as const;
  const usage = input.lastCompleteCycleCostCents;
  if (usage == null || !Number.isFinite(usage) || usage < 0) return 'LAST_CYCLE_USAGE_UNAVAILABLE' as const;
  return usage < targetLimit ? 'ELIGIBLE' as const : 'DOWNGRADE_LIMIT_EXCEEDED' as const;
}
