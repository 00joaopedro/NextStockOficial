import { assertPublicSlug, normalizePublicSlug } from './storefront-slug';
describe('storefront slug', () => {
  it('normaliza unicode e espacos', () =>
    expect(normalizePublicSlug('  Loja São João  ')).toBe('loja-sao-joao'));
  it.each(['api', 'admin', 'loja', 'produtos', 'pedido'])(
    'bloqueia palavra reservada %s',
    (value) => expect(assertPublicSlug(value)).toBe(false),
  );
  it('aceita slug publico seguro', () =>
    expect(assertPublicSlug('filial-centro-2')).toBe(true));
});
