const NEXTSTOCK_SESSION_KEYS = [
  'nextstockPreviewMode',
  'nextstockIsPreview',
  'nextstockSelectedBranch',
  'nextstockSystemType',
  'nextstockSelectedSystemType',
  'nextstockIsSuperAdmin',
  'nextstockIsDevSuperAdmin',
  'nextstockTenantId',
  'nextstockBranchId',
  'nextstockAuthenticatedUser',
  'nextstockBackendMode',
  'nextstockDevSupportContext',
];

const NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES = [
  'nextstockPedidosCliente',
  'nextstockUltimoPedido',
  'nextstockPedidoParaNfe',
  'nextstockReciboPendente',
  'nextstockNotaFiscalPendente',
  'nextstockUltimaVendaPaga',
  'nextstockDashboard',
  'nextstockCaixa',
  'nextstockProdutos',
  'nextstockAgenda',
  'nextstockDevContext:',
  'nextstockDevSupportContext',
];

function clearNextStockOperationalCache(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);

      if (
        key &&
        NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES.some((prefix) =>
          key.startsWith(prefix),
        )
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);

      if (
        key &&
        NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES.some((prefix) =>
          key.startsWith(prefix),
        )
      ) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

function clearNextStockSessionState(): void {
  try {
    NEXTSTOCK_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  clearNextStockOperationalCache();
}

function isNextStockDemoMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  const previewRequested =
    sessionStorage.getItem('nextstockIsPreview') === 'true' ||
    sessionStorage.getItem('nextstockPreviewMode') === 'true' ||
    params.get('mode') === 'preview' ||
    params.get('mode') === 'visualizacao';
  const authenticatedUser = sessionStorage.getItem(
    'nextstockAuthenticatedUser',
  );

  return previewRequested && !authenticatedUser;
}

function isNextStockProductionMode(): boolean {
  return !isNextStockDemoMode();
}

function getNextStockPublicPreviewContext(): {
  systemMode: 'PREVIEW';
  tenantType: 'STANDARD' | 'PETSHOP';
  systemType: 'padrao' | 'petshop';
  mode: 'visualizacao';
} | null {
  if (!isNextStockDemoMode()) return null;

  const selected =
    sessionStorage.getItem('nextstockSelectedSystemType') ||
    sessionStorage.getItem('nextstockSystemType');
  const systemType = selected === 'petshop' ? 'petshop' : 'padrao';

  return {
    systemMode: 'PREVIEW',
    tenantType: systemType === 'petshop' ? 'PETSHOP' : 'STANDARD',
    systemType,
    mode: 'visualizacao',
  };
}

const PREVIEW_BLOCK_CODE = 'PREVIEW_MODE_MUTATION_BLOCKED';
const PREVIEW_BLOCK_MESSAGE = 'Modo visualização: ação bloqueada.';

function setNextStockBackendContext(context: {
  systemMode?: string;
  systemType?: string;
  tenantType?: string;
}): void {
  const preview = String(context?.systemMode || '').toUpperCase() === 'PREVIEW';
  const systemType =
    context?.systemType ||
    (String(context?.tenantType || '').toUpperCase() === 'PETSHOP'
      ? 'petshop'
      : 'padrao');

  sessionStorage.setItem(
    'nextstockBackendMode',
    preview ? 'preview' : 'production',
  );
  sessionStorage.setItem('nextstockSystemType', systemType);
  sessionStorage.setItem('nextstockSelectedSystemType', systemType);

  if (preview) {
    sessionStorage.setItem('nextstockPreviewMode', 'true');
    sessionStorage.setItem('nextstockIsPreview', 'true');
  } else {
    sessionStorage.removeItem('nextstockPreviewMode');
    sessionStorage.removeItem('nextstockIsPreview');
  }

  document.documentElement.dataset.systemMode = preview
    ? 'PREVIEW'
    : 'PRODUCTION';
  window.dispatchEvent(
    new CustomEvent('nextstock:system-context', { detail: context }),
  );
}

function showNextStockPreviewBlocked(message = PREVIEW_BLOCK_MESSAGE): void {
  window.dispatchEvent(
    new CustomEvent('nextstock:preview-blocked', {
      detail: { code: PREVIEW_BLOCK_CODE, message },
    }),
  );
}

Object.assign(window, {
  clearNextStockOperationalCache,
  clearNextStockSessionState,
  isNextStockDemoMode,
  isNextStockProductionMode,
  getNextStockPublicPreviewContext,
  setNextStockBackendContext,
  showNextStockPreviewBlocked,
});

const originalNextStockFetch = window.fetch.bind(window);
window.fetch = async (...args: Parameters<typeof fetch>) => {
  const request = args[0];
  const init = args[1];
  const url =
    typeof request === 'string'
      ? request
      : request instanceof URL
        ? request.href
        : request.url;
  const method = String(init?.method || (request instanceof Request ? request.method : 'GET')).toUpperCase();

  if (
    isNextStockDemoMode() &&
    new URL(url, window.location.origin).pathname.startsWith('/api/') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(method)
  ) {
    showNextStockPreviewBlocked();
    return new Response(
      JSON.stringify({
        statusCode: 403,
        code: PREVIEW_BLOCK_CODE,
        message: PREVIEW_BLOCK_MESSAGE,
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const response = await originalNextStockFetch(...args);

  if (
    response.status === 402 &&
    !window.location.pathname.toLowerCase().endsWith('/perfil.html')
  ) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string; redirectTo?: string } | null;

    if (body?.code === 'BILLING_ACCESS_REQUIRED') {
      window.location.href = body.redirectTo || '/perfil.html';
    }
  }

  if (response.status === 403) {
    const body = (await response
      .clone()
      .json()
      .catch(() => null)) as { code?: string; message?: string } | null;

    if (body?.code === PREVIEW_BLOCK_CODE) {
      showNextStockPreviewBlocked(body.message || PREVIEW_BLOCK_MESSAGE);
    }
  }

  return response;
};
