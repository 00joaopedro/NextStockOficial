const NEXTSTOCK_SESSION_KEYS = [
  "nextstockPreviewMode",
  "nextstockIsPreview",
  "nextstockSelectedBranch",
  "nextstockSystemType",
  "nextstockSelectedSystemType",
  "nextstockIsSuperAdmin",
  "nextstockIsDevSuperAdmin",
  "nextstockTenantId",
  "nextstockBranchId",
  "nextstockAuthenticatedUser",
  "nextstockBackendMode",
];

const NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES = [
  "nextstockPedidosCliente",
  "nextstockUltimoPedido",
  "nextstockPedidoParaNfe",
  "nextstockReciboPendente",
  "nextstockNotaFiscalPendente",
  "nextstockUltimaVendaPaga",
  "nextstockDashboard",
  "nextstockCaixa",
  "nextstockProdutos",
  "nextstockAgenda",
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

  return (
    sessionStorage.getItem("nextstockIsPreview") === "true" ||
    sessionStorage.getItem("nextstockPreviewMode") === "true" ||
    sessionStorage.getItem("nextstockBackendMode") === "preview" ||
    params.get("mode") === "preview" ||
    params.get("mode") === "visualizacao"
  );
}

function isNextStockProductionMode(): boolean {
  return !isNextStockDemoMode();
}

Object.assign(window, {
  clearNextStockOperationalCache,
  clearNextStockSessionState,
  isNextStockDemoMode,
  isNextStockProductionMode,
});
