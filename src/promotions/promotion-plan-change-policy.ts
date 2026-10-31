import { serverUsageLimitCents } from '../billing/server-usage-policy';

/** Selection only; it does not reserve a slot, change a subscription or charge. */
export function promotionChangeOptions(input: {
  promotionalPeriodEndsAt: Date | null;
  now: Date;
  currentPlan: 'ouro' | 'esmeralda';
  esmeraldaUsageCents: number | null;
}) {
  const end = input.promotionalPeriodEndsAt;
  if (
    !end ||
    !Number.isFinite(end.getTime()) ||
    !Number.isFinite(input.now.getTime())
  ) {
    return {
      available: false,
      code: 'PROMOTIONAL_END_UNAVAILABLE',
      options: [] as string[],
    };
  }
  if (input.now < end) {
    return {
      available: false,
      code: 'PROMOTIONAL_PERIOD_ACTIVE',
      options: [] as string[],
    };
  }
  if (input.currentPlan === 'ouro') {
    return {
      available: true,
      code: 'PROMOTIONAL_OPTION_AVAILABLE',
      options: ['esmeralda_promocional'],
    };
  }
  const esmeraldaLimitCents = serverUsageLimitCents('esmeralda');
  if (
    input.esmeraldaUsageCents === null ||
    !Number.isFinite(input.esmeraldaUsageCents) ||
    input.esmeraldaUsageCents < 0 ||
    esmeraldaLimitCents === null ||
    !Number.isFinite(esmeraldaLimitCents) ||
    esmeraldaLimitCents <= 0
  ) {
    return {
      available: false,
      code: 'USAGE_UNAVAILABLE',
      options: [] as string[],
    };
  }
  return input.esmeraldaUsageCents >= esmeraldaLimitCents
    ? {
        available: true,
        code: 'ESMERALDA_USAGE_LIMIT_REACHED',
        options: ['diamante_normal'],
      }
    : {
        available: false,
        code: 'ESMERALDA_USAGE_BELOW_LIMIT',
        options: [] as string[],
      };
}
