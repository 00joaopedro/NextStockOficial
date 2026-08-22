import { readFileSync } from 'fs';
import { join } from 'path';

function pageSource(root: string, file: string) {
  const html = readFileSync(join(root, 'public', file), 'utf8');
  const extracted = file.replace(/\.html$/, '-inline1.js');
  try {
    return `${html}\n${readFileSync(join(root, 'public', 'Js', 'csp-extracted', extracted), 'utf8')}`;
  } catch {
    return html;
  }
}
describe('public storefront frontend isolation', () => {
  const html = readFileSync(join(process.cwd(), 'public', 'loja.html'), 'utf8');
  const script = readFileSync(
    join(process.cwd(), 'public', 'storefront.js'),
    'utf8',
  );
  it('carrega somente o bundle publico', () => {
    expect(html).toContain('/storefront.js');
    expect(html).not.toMatch(/sidebar|session-state|dashboard/i);
  });
  it('nao envia preco, total, tenant ou filial no checkout', () => {
    const checkoutPayload = script.slice(
      script.indexOf('const payload='),
      script.indexOf('const email=', script.indexOf('const payload=')),
    );
    expect(checkoutPayload).toContain('productSlug');
    expect(checkoutPayload).toContain('quantity');
    expect(checkoutPayload).not.toMatch(
      /priceCents|totalCents|tenantId|branchId/,
    );
  });
  it('escapa conteudo dinamico usando textContent', () => {
    expect(script).toContain('el.textContent=value');
    expect(script).not.toContain('innerHTML');
  });
});
