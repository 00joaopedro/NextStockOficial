import { readFileSync } from 'fs';
import { join } from 'path';

function publicFile(path: string) {
  return readFileSync(join(__dirname, '..', 'public', path), 'utf8');
}

describe('Frontend session and demo isolation', () => {
  it('centraliza limpeza de contexto e caches operacionais', () => {
    const helper = publicFile('Js/session-state.ts');

    expect(helper).toContain('nextstockTenantId');
    expect(helper).toContain('nextstockBranchId');
    expect(helper).toContain('nextstockAuthenticatedUser');
    expect(helper).toContain('nextstockBackendMode');
    expect(helper).toContain('clearNextStockOperationalCache');
    expect(helper).toContain('clearNextStockSessionState');
  });

  it('login e logout usam a limpeza centralizada', () => {
    const index = publicFile('index.html');
    const dev = publicFile('dev.html');

    expect(index).toContain('window.clearNextStockSessionState');
    expect(dev).toContain('window.clearNextStockSessionState');
  });

  it('produtos e agenda so inicializam mocks em demo explicito', () => {
    const products = publicFile('produtos.html');
    const agenda = publicFile('agendaPet.html');

    expect(products).toContain('let products = isDemoMode() ? DEMO_PRODUCTS : []');
    expect(agenda).toContain('id="legacy-agenda-demo-disabled"');
    expect(agenda).toContain('src="./dist/agendaPet.js"');

    for (const file of [
      'fornecedor.html',
      'ntfe.html',
      'fechamento.html',
      'historico.html',
      'pedido.html',
      'despesas.html',
    ]) {
      expect(publicFile(file)).toContain('window.isNextStockDemoMode?.()');
    }
  });
});
