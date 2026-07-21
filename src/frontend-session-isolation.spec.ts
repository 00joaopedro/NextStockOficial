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

    expect(products).toContain(
      'let products = isDemoMode() ? DEMO_PRODUCTS : []',
    );
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

  it('preview autenticado nao e confundido com demo publico', () => {
    const helper = publicFile('Js/session-state.ts');
    const products = publicFile('produtos.html');

    expect(helper).toContain('previewRequested && !authenticatedUser');
    expect(products).toContain(
      '!sessionStorage.getItem("nextstockAuthenticatedUser")',
    );
  });

  it('preview block nao limpa sessao nem redireciona', () => {
    const helper = publicFile('Js/session-state.ts');

    expect(helper).toContain('PREVIEW_MODE_MUTATION_BLOCKED');
    expect(helper).toContain('showNextStockPreviewBlocked');
    expect(helper).toContain('response.status === 403');
    expect(helper).not.toMatch(
      /body\?\.code === PREVIEW_BLOCK_CODE[\s\S]{0,220}clearNextStockSessionState/,
    );
    expect(helper).not.toMatch(
      /body\?\.code === PREVIEW_BLOCK_CODE[\s\S]{0,220}location\.href/,
    );
  });

  it('sidebar mantem navegacao e aviso em visualizacao', () => {
    const sidebar = publicFile('Js/sidebar.ts');

    expect(sidebar).toContain('Você pode navegar e consultar dados');
    expect(sidebar).toContain('applyPreviewUi(context)');
    expect(sidebar).not.toContain('clearNextStockSessionState?.();');
  });

  it('preview publico monta contexto local sem consultar contexto ou billing', () => {
    const helper = publicFile('Js/session-state.ts');
    const sidebar = publicFile('Js/sidebar.ts');

    expect(helper).toContain('getNextStockPublicPreviewContext');
    expect(sidebar).toContain(
      '(window as any).getNextStockPublicPreviewContext?.()',
    );
    expect(sidebar.indexOf('if (publicPreview)')).toBeLessThan(
      sidebar.indexOf("const selectedBranchId = getSelectedBranchId()"),
    );
  });

  it('bloqueia requests mutaveis no preview publico antes da rede', () => {
    const helper = publicFile('Js/session-state.ts');

    expect(helper).toContain("pathname.startsWith('/api/')");
    expect(helper).toContain("!['GET', 'HEAD', 'OPTIONS'].includes(method)");
    expect(helper.indexOf('isNextStockDemoMode() &&')).toBeLessThan(
      helper.indexOf('originalNextStockFetch(...args)'),
    );
  });

  it('paginas antes protegidas interrompem bootstrap autenticado no demo', () => {
    for (const file of [
      'caixa.js',
      'despesas.js',
      'fornecedor.js',
      'funcionario.js',
      'historico.js',
      'ntfe.js',
      'perfil.js',
    ]) {
      expect(publicFile(`Js/${file}`)).toContain(
        'window.isNextStockDemoMode?.()',
      );
    }
  });

  it('todas as paginas navegaveis carregam o estado de preview', () => {
    for (const file of ['guia.html', 'migracao.html']) {
      expect(publicFile(file)).toContain('./dist/session-state.js');
    }

    expect(publicFile('Js/sidebar.ts')).not.toContain('pagamentos.html');
  });
});
