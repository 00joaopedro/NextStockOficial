import { calculateQuantityPriceCents, normalizeQuantity } from './quantity.util';

describe('quantity utilities', () => {
  it('accepts fractional quantities with bounded precision', () => {
    expect(normalizeQuantity('1.250')).toBe(1.25);
    expect(calculateQuantityPriceCents(1299, 1.25)).toBe(1624);
  });

  it('rejects zero, negative and excessive precision', () => {
    expect(() => normalizeQuantity(0)).toThrow();
    expect(() => normalizeQuantity(-1)).toThrow();
    expect(() => normalizeQuantity('1.1234567')).toThrow();
  });
});
