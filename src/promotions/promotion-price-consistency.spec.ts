import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROMOTION_OFFERS } from './promotion-offers';

const periodLabels = {
  1: 'mês',
  3: 'trimestre',
  6: 'semestre',
} as const;

describe('promotional commercial prices', () => {
  const html = readFileSync(join(process.cwd(), 'public/promocao.html'), 'utf8');
  const cards = Array.from(
    html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g),
    ([, card]) => card,
  );

  it.each(PROMOTION_OFFERS)(
    'matches the checkout charge on the public card for $planSlug/$periodMonths',
    (offer) => {
      expect(Number.isSafeInteger(offer.chargeAmountCents)).toBe(true);
      expect(offer.chargeAmountCents).toBeGreaterThan(0);
      expect(offer.chargeAmountCents).toBe(offer.totalPriceCents);
      expect(offer.chargeIntervalMonths).toBe(offer.periodMonths);

      const matchingCards = cards.filter(
        (card) =>
          card.includes(`data-plan="${offer.planSlug}"`) &&
          card.includes(`data-period="${offer.periodMonths}"`),
      );
      expect(matchingCards).toHaveLength(1);
      const price = matchingCards[0].match(
        /<div class="price">R\$\s+([^<]+)<small>por ([^<]+)<\/small>/,
      );
      expect(price?.[1].trim()).toBe(
        (offer.chargeAmountCents / 100).toLocaleString('pt-BR'),
      );
      expect(price?.[2]).toBe(periodLabels[offer.chargeIntervalMonths]);
    },
  );
});
