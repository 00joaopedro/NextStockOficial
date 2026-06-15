import { readFileSync } from 'fs';
import { join } from 'path';

describe('caixa.html production PDV integration', () => {
  const html = readFileSync(
    join(process.cwd(), 'public', 'caixa.html'),
    'utf8',
  );
  const script = readFileSync(
    join(process.cwd(), 'public', 'Js', 'caixa.js'),
    'utf8',
  );

  it('desativa o checkout local legado e carrega o script real', () => {
    expect(html).toContain('data-legacy-cash-script="disabled"');
    expect(html).toContain('./Js/caixa.js');
    expect(script).not.toContain('produtosCatalogo');
  });

  it('valida perfil e contexto antes do PDV', () => {
    expect(script).toContain('/api/auth/profile');
    expect(script).toContain('/api/system/context');
    expect(script).toContain('x-nextstock-branch-id');
  });

  it('usa produtos, maquininhas e venda reais', () => {
    expect(script).toContain('/api/products/lookup?');
    expect(script).toContain('/api/payment-machines');
    expect(script).toContain('api("/api/sales"');
    expect(script).toContain('idempotencyKey');
  });

  it('usa saleId para recibo e nota fiscal', () => {
    expect(script).toContain('/receipt');
    expect(script).toContain('ntfe.html?saleId=');
    expect(script).not.toContain('nextstockNotaFiscalPendente');
    expect(script).not.toContain('nextstockUltimaVendaPaga');
  });

  it('renderiza dados de API com DOM seguro e bloqueia granel', () => {
    expect(script).toContain('textContent');
    expect(script).toContain('replaceChildren');
    expect(script).not.toContain('.innerHTML');
    expect(script).toContain('Venda por granel esta bloqueada');
  });
});
