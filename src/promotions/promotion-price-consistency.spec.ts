import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROMOTION_OFFERS, getPromotionOffer } from './promotion-offers';

describe('promotional commercial prices', () => {
  it.each(PROMOTION_OFFERS)('keeps the exact scheduled total for $planSlug/$periodMonths', (offer) => {
    expect(Number.isSafeInteger(offer.monthlyPriceCents)).toBe(true);
    expect(offer.monthlyPriceCents * offer.periodMonths).toBe(offer.totalPriceCents);
  });

  it('matches the approved Ouro prices and the public landing', () => {
    const html = readFileSync(join(process.cwd(), 'public/promocao.html'), 'utf8');
    expect(getPromotionOffer('ouro', 3)).toMatchObject({ monthlyPriceCents: 6666, totalPriceCents: 19998 });
    expect(getPromotionOffer('ouro', 6)).toMatchObject({ monthlyPriceCents: 6666, totalPriceCents: 39996 });
    expect(html).toContain('R$ 199,98');
    expect(html).toContain('R$ 399,96');
    expect(html).toContain('3 cobranças mensais de R$ 66,66');
    expect(html).toContain('6 cobranças mensais de R$ 66,66');
  });
});
