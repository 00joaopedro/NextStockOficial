/**
 * Selection only: this does not reserve a slot, change a subscription or charge.
 * Dates and capacity must be authoritative before presenting an option.
 */
export function promotionChangeOptions(input: {
  promotionalPeriodEndsAt: Date | null;
  now: Date;
  esmeraldaPromotionAvailable: boolean | null;
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
  if (input.esmeraldaPromotionAvailable === null) {
    return {
      available: false,
      code: 'PROMOTIONAL_CAPACITY_UNAVAILABLE',
      options: [] as string[],
    };
  }
  return input.esmeraldaPromotionAvailable
    ? {
        available: true,
        code: 'PROMOTIONAL_OPTION_AVAILABLE',
        options: ['esmeralda_promocional'],
      }
    : {
        available: true,
        code: 'PROMOTIONAL_CAPACITY_REACHED',
        options: ['diamante_normal'],
      };
}
