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

describe('frontend auth pages', () => {
  const publicFile = (file: string) => pageSource(join(__dirname, '..'), file);

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
    expect(html).toContain(
      'Os valores de Railway e Supabase s&atilde;o estimativas',
    );
    expect(html).toContain(
      '<option value="day">Dia atual at&eacute; agora</option>',
    );
    expect(html).toContain('<option value="week">Semana</option>');
    expect(html).toContain('<option value="month">M&ecirc;s</option>');
    expect(html).toContain('Carregando uso estimado dos usuarios');
    expect(html).toContain(
      "sessionStorage.setItem('nextstockBackendMode', 'production')",
    );
    expect(html).toContain(
      "sessionStorage.setItem('nextstockSelectedBranch', JSON.stringify(selectedBranch))",
    );
    expect(html).toContain(
      "sessionStorage.setItem('nextstockSelectedSystemType', selectedType)",
    );
    expect(html).toContain(
      "sessionStorage.setItem('nextstockIsDevSuperAdmin', 'true')",
    );
    expect(html).toContain(
      "const workspaceResponse = await requestJson('/dev/workspaces')",
    );
    expect(html).toContain(
      'item.systemType === selectedType && item.isDevWorkspace === true',
    );
    expect(html).toContain('Workspace Dev Pet Shop nao encontrado');
    expect(html).toContain(
      'clientePet.html?systemType=petshop&mode=production',
    );
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

  it('index.html trata erros de auth sem expor detalhes internos', () => {
    const html = publicFile('index.html');

    expect(html).toContain('function extractApiErrorMessage(status, data)');
    expect(html).toContain('status === 401');
    expect(html).toContain('status === 409');
    expect(html).toContain('status === 422');
    expect(html).toContain('status === 503');
    expect(html).toContain('Sistema temporariamente indisponivel');
    expect(html).toContain('Erro interno. Tente novamente em instantes.');
    expect(html).not.toContain('profiles.allowed_system_types');
    expect(html).not.toContain('PrismaClientKnownRequestError');
  });

  it('dados locais operacionais sao isolados por usuario, tenant e filial', () => {
    const pages = ['produtos.html', 'caixa.html', 'pedido.html'];

    for (const page of pages) {
      expect(publicFile(page)).toContain('getOperationalStorageKey');
      expect(publicFile(page)).toContain('branch?.tenantId || "no-tenant"');
      expect(publicFile(page)).toContain('branch?.id || "no-branch"');
      expect(publicFile(page)).toContain('user?.id || "anonymous"');
    }

    expect(publicFile('dist/dashboard.js')).toContain('x-nextstock-branch-id');
  });

  it('sidebar mostra Dev somente com isDevSuperAdmin vindo do backend', () => {
    const source = publicFile('Js/sidebar.ts');
    const dist = publicFile('dist/sidebar.js');

    expect(source).toMatch(
      /\{ label: ['"]Dev['"], href: ['"]dev\.html['"], key: ['"]dev['"], module: ['"]dev['"] \}/,
    );
    expect(source).toContain('function isDevSuperAdminUser');
    expect(source).toContain('if (isDevSuperAdminUser(context))');
    expect(source).toContain('function getRuntimeFallbackContext');
    expect(source).toContain('return FALLBACK_CONTEXT');

    expect(dist).toMatch(
      /\{ label: ['"]Dev['"], href: ['"]dev\.html['"], key: ['"]dev['"], module: ['"]dev['"] \}/,
    );
    expect(dist).toContain('function isDevSuperAdminUser');
    expect(dist).toContain('if (isDevSuperAdminUser(context))');
  });

  it('sidebar registra page_view em modo production sem expor tokens', () => {
    const source = publicFile('Js/sidebar.ts');

    expect(source).toMatch(
      /const PAGE_VIEW_ENDPOINT = ['"]\/api\/usage\/page-view['"]/,
    );
    expect(source).toContain('function recordPageView');
    expect(source).toMatch(/eventType: ['"]page_view['"]/);
    expect(source).not.toContain('RAILWAY_API_TOKEN');
    expect(source).not.toContain('SUPABASE_ACCESS_TOKEN');
  });

  it('sidebar reutiliza snapshot seguro e revalida contexto e billing separadamente', () => {
    const source = publicFile('Js/sidebar.ts');

    expect(source).toContain('function readSidebarSnapshot');
    expect(source).toContain('function writeSidebarSnapshot');
    expect(source).toContain('function clearSidebarSnapshot');
    expect(source).toContain('const SIDEBAR_CACHE_SCHEMA = 1');
    expect(source).toContain('const SIDEBAR_CACHE_TTL_MS = 3 * 60 * 1000');
    expect(source).toContain('raw.length <= 64 * 1024');
    expect(source).toContain('candidate.expiresAt > Date.now()');
    expect(source).toContain('JSON.parse(raw)');
    expect(source).toContain('clearSidebarSnapshot();');

    expect(source).toContain('renderSidebar(container, snapshot.context, snapshot.menu);');
    expect(source).toContain('const snapshot = readSidebarSnapshot();');
    expect(source).toContain('void fetchBilling(context).then');
    expect(source).toContain('writeSidebarSnapshot(resolved, menu);');
    expect(source).toContain('data-sidebar-state\', \'revalidating\'');

    expect(source).toContain('function fetchSystemContext');
    expect(source).toContain('function fetchBilling');
    expect(source).toContain('nextstock-sidebar-context-start');
    expect(source).toContain('nextstock-sidebar-context-ready');
    expect(source).toContain('nextstock-sidebar-billing-start');
    expect(source).toContain('nextstock-sidebar-billing-ready');
    expect(source).toContain('nextstock-sidebar-cache-hit');
    expect(source).toContain('nextstock-sidebar-cache-miss');
    expect(source).toContain('nextstock-sidebar-first-menu');
    expect(source).toContain('nextstock-sidebar-ready');

    expect(source).toContain("if (response.status === 401 || response.status === 403) clearSidebarSnapshot();");
    expect(source).toContain("if (billingResponse.status === 401 || billingResponse.status === 403)");
    expect(source).toContain("renderSidebar(container, context, provisional);");
    expect(source).toContain("billingAllowed: false");
    expect(source).not.toContain('function renderSidebarShell');
    expect(source).not.toContain('const contextResponsePromise = fetch');
    expect(source).not.toContain('const billingResponsePromise = fetch');
    expect(source).not.toContain('await Promise.all([contextResponsePromise');
    expect(source).not.toContain('billingResponsePromise.catch(() => null)');
  });
});
