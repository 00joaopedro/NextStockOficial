"use strict";
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
function clearNextStockOperationalCache() {
    try {
        for (let index = localStorage.length - 1; index >= 0; index -= 1) {
            const key = localStorage.key(index);
            if (key &&
                NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                localStorage.removeItem(key);
            }
        }
    }
    catch {
    }
}
function clearNextStockSessionState() {
    try {
        NEXTSTOCK_SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
    }
    catch {
    }
    clearNextStockOperationalCache();
}
function isNextStockDemoMode() {
    const params = new URLSearchParams(window.location.search);
    return (sessionStorage.getItem("nextstockIsPreview") === "true" ||
        sessionStorage.getItem("nextstockPreviewMode") === "true" ||
        sessionStorage.getItem("nextstockBackendMode") === "preview" ||
        params.get("mode") === "preview" ||
        params.get("mode") === "visualizacao");
}
function isNextStockProductionMode() {
    return !isNextStockDemoMode();
}
Object.assign(window, {
    clearNextStockOperationalCache,
    clearNextStockSessionState,
    isNextStockDemoMode,
    isNextStockProductionMode,
});
