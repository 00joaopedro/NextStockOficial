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
    "nextstockDevSupportContext",
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
    "nextstockDevContext:",
    "nextstockDevSupportContext",
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
    try {
        for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
            const key = sessionStorage.key(index);
            if (key &&
                NEXTSTOCK_OPERATIONAL_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
                sessionStorage.removeItem(key);
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
const originalNextStockFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
    const response = await originalNextStockFetch(...args);
    if (response.status === 402 &&
        !window.location.pathname.toLowerCase().endsWith("/perfil.html")) {
        const body = await response
            .clone()
            .json()
            .catch(() => null);
        if (body?.code === "BILLING_ACCESS_REQUIRED") {
            window.location.href = body.redirectTo || "/perfil.html";
        }
    }
    return response;
};
