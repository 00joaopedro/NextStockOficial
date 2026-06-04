import { readFileSync } from 'fs';
import { join } from 'path';

describe('frontend auth pages', () => {
  const publicFile = (file: string) =>
    readFileSync(join(__dirname, '..', 'public', file), 'utf8');

  it('index.html nao possui selecao manual de filial no login', () => {
    const html = publicFile('index.html');

    expect(html).not.toContain('login' + 'Branch');
    expect(html).not.toContain('branchSelection' + 'Panel');
    expect(html).not.toContain('requires' + 'BranchSelection');
    expect(html).not.toContain('agora selecione' + ' a sua filial');
  });

  it('dev.html abre sistema em production sem definir preview', () => {
    const html = publicFile('dev.html');

    expect(html).toContain("await requestJson('/dev/health')");
    expect(html).toContain('Acesso restrito ao Dev SuperAdmin.');
    expect(html).toContain('Os valores de Railway e Supabase s&atilde;o estimativas');
    expect(html).toContain('<option value="day">Dia atual at&eacute; agora</option>');
    expect(html).toContain('<option value="week">Semana</option>');
    expect(html).toContain('<option value="month">M&ecirc;s</option>');
    expect(html).toContain('Carregando uso estimado dos usuarios');
    expect(html).toContain("sessionStorage.setItem('nextstockBackendMode', 'production')");
    expect(html).toContain("sessionStorage.setItem('nextstockSelectedBranch', JSON.stringify(selectedBranch))");
    expect(html).toContain("sessionStorage.setItem('nextstockSelectedSystemType', selectedType)");
    expect(html).toContain("sessionStorage.setItem('nextstockIsDevSuperAdmin', 'true')");
    expect(html).toContain("const branch = candidates.find((item) => item.systemType === selectedType)");
    expect(html).toContain('Nenhuma filial Pet Shop real encontrada para abrir este modo.');
    expect(html).toContain('clientePet.html?systemType=petshop&mode=production');
    expect(html).toContain('produtos.html?systemType=padrao&mode=production');
    expect(html).not.toContain("sessionStorage.setItem('nextstockPreviewMode'");
    expect(html).not.toContain("sessionStorage.setItem('nextstockIsPreview'");
  });

  it('cadastro.html exige sessao real e bloqueia escrita em visualizacao', () => {
    const html = publicFile('cadastro.html');

    expect(html).toContain('/auth/profile');
    expect(html).toContain('/system/context');
    expect(html).toContain('detectarPreviewExplicito');
    expect(html).toContain('Sess\\u00e3o expirada ou inv\\u00e1lida');
    expect(html).toContain('montarPayloadProduto');
    expect(html).toContain('"x-nextstock-branch-id"');
    expect(html).not.toContain('payload.tenantId');
    expect(html).not.toContain('payload.branchId');
    expect(html).toContain('Modo visualiza');
    expect(html).not.toContain('if (usuarioSuperAdmin) return false');
  });

  it('produtos.html consome produtos reais quando backend esta em production', () => {
    const html = publicFile('produtos.html');

    expect(html).toContain('loadProductsFromBackend');
    expect(html).toContain('/api/products');
    expect(html).toContain('"x-nextstock-branch-id"');
    expect(html).toContain('nextstockBackendMode');
    expect(html).toContain('mode") === "production"');
  });

  it('dados locais operacionais sao isolados por usuario, tenant e filial', () => {
    const pages = ['produtos.html', 'caixa.html', 'pedido.html'];

    for (const page of pages) {
      expect(publicFile(page)).toContain('getOperationalStorageKey');
      expect(publicFile(page)).toContain('branch?.tenantId || "no-tenant"');
      expect(publicFile(page)).toContain('branch?.id || "no-branch"');
      expect(publicFile(page)).toContain('user?.id || "anonymous"');
    }

    expect(publicFile('dashboard.html')).toContain('getLocalStorageScope');
    expect(publicFile('dashboard.html')).toContain('`${chave}:${storageScope}`');
  });

  it('sidebar mostra Dev somente com isDevSuperAdmin vindo do backend', () => {
    const source = publicFile('Js/sidebar.ts');
    const dist = publicFile('dist/sidebar.js');

    expect(source).toContain('{ label: "Dev", href: "dev.html", key: "dev", module: "dev" }');
    expect(source).toContain('function isDevSuperAdminUser');
    expect(source).toContain('if (isDevSuperAdminUser(context))');
    expect(source).toContain('function getRuntimeFallbackContext');
    expect(source).toContain('return FALLBACK_CONTEXT');

    expect(dist).toContain('{ label: "Dev", href: "dev.html", key: "dev", module: "dev" }');
    expect(dist).toContain('function isDevSuperAdminUser');
    expect(dist).toContain('if (isDevSuperAdminUser(context))');
  });

  it('sidebar registra page_view em modo production sem expor tokens', () => {
    const source = publicFile('Js/sidebar.ts');

    expect(source).toContain('const PAGE_VIEW_ENDPOINT = "/api/usage/page-view"');
    expect(source).toContain('function recordPageView');
    expect(source).toContain('eventType: "page_view"');
    expect(source).not.toContain('RAILWAY_API_TOKEN');
    expect(source).not.toContain('SUPABASE_ACCESS_TOKEN');
  });
});
