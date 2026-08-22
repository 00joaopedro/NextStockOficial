const RESERVED = new Set([
  'api',
  'admin',
  'login',
  'logout',
  'cadastro',
  'dev',
  'health',
  'loja',
  'produto',
  'produtos',
  'pedido',
  'pedidos',
  'assets',
  'dist',
  'public',
]);
export function normalizePublicSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
export function assertPublicSlug(slug: string) {
  return (
    slug.length >= 3 &&
    slug.length <= 63 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) &&
    !RESERVED.has(slug)
  );
}
