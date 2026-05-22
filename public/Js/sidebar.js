var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var STANDARD_MENU = [
    { label: "Caixa", href: "caixa.html", key: "caixa" },
    { label: "Perfil", href: "perfil.html", key: "perfil" },
    { label: "Guia", href: "guia.html", key: "guia" },
    { label: "Produtos", href: "produtos.html", key: "produtos" },
    { label: "Pedidos", href: "pedido.html", key: "pedido" },
    { label: "Fornecedores", href: "fornecedor.html", key: "fornecedor" },
    { label: "Cadastro", href: "cadastro.html", key: "cadastro" },
    { label: "Migração", href: "migracao.html", key: "migracao" },
    { label: "Despesas", href: "despesas.html", key: "despesas" },
    { label: "Histórico", href: "historico.html", key: "historico" },
    { label: "Fechamento", href: "fechamento.html", key: "fechamento" },
    { label: "Dashboard", href: "dashboard.html", key: "dashboard" },
    { label: "Pagamento", href: "pagamentos.html", key: "pagamentos" },
    { label: "Funcionários", href: "funcionario.html", key: "funcionario" },
    { label: "NTF-e", href: "ntfe.html", key: "ntfe" },
    { label: "Suporte", href: "#", key: "suporte" }
];
var PETSHOP_MENU = [
    { label: "Caixa", href: "caixa.html", key: "caixa" },
    { label: "Perfil", href: "perfil.html", key: "perfil" },
    { label: "Agenda", href: "agendaPet.html", key: "agendaPet" },
    { label: "Clientes", href: "clientePet.html", key: "clientePet" },
    { label: "Guia", href: "guia.html", key: "guia" },
    { label: "Produtos", href: "produtos.html", key: "produtos" },
    { label: "Pedidos", href: "pedido.html", key: "pedido" },
    { label: "Fornecedores", href: "fornecedor.html", key: "fornecedor" },
    { label: "Cadastro", href: "cadastro.html", key: "cadastro" },
    { label: "Migração", href: "migracao.html", key: "migracao" },
    { label: "Despesas", href: "despesas.html", key: "despesas" },
    { label: "Histórico", href: "historico.html", key: "historico" },
    { label: "Fechamento", href: "fechamento.html", key: "fechamento" },
    { label: "Dashboard", href: "dashboard.html", key: "dashboard" },
    { label: "Pagamento", href: "pagamentos.html", key: "pagamentos" },
    { label: "Funcionários", href: "funcionario.html", key: "funcionario" },
    { label: "NTF-e", href: "ntfe.html", key: "ntfe" },
    { label: "Suporte", href: "#", key: "suporte" }
];
function getCurrentPageFileName() {
    var path = window.location.pathname;
    return path.substring(path.lastIndexOf("/") + 1);
}
function getActiveKey(menu) {
    var currentFile = getCurrentPageFileName();
    var currentItem = menu.find(function (item) { return item.href === currentFile; });
    return currentItem ? currentItem.key : "";
}
function buildSidebarHtml(menu, context) {
    var activeKey = getActiveKey(menu);
    var modeLabel = context.systemMode === "PREVIEW" ? "Preview" : "";
    var menuHtml = menu.map(function (item) {
        var activeClass = item.key === activeKey ? "active" : "";
        return "\n      <a href=\"".concat(item.href, "\">\n        <li class=\"").concat(activeClass, "\">").concat(item.label, "</li>\n      </a>\n    ");
    }).join("");
    return "\n    <aside class=\"sidebar\" data-system-mode=\"".concat(context.systemMode, "\" data-tenant-type=\"").concat(context.tenantType, "\">\n      <h2>NextStock ").concat(modeLabel, "</h2>\n\n      <ul class=\"menu\">\n        ").concat(menuHtml, "\n      </ul>\n    </aside>\n  ");
}
function getMenuByTenantType(tenantType) {
    if (tenantType === "PETSHOP") {
        return PETSHOP_MENU;
    }
    return STANDARD_MENU;
}
function loadSidebar() {
    return __awaiter(this, void 0, void 0, function () {
        var container, response, context, menu, error_1, fallbackContext;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    container = document.getElementById("sidebar-container");
                    if (!container) {
                        console.error("Elemento #sidebar-container não encontrado.");
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("/api/system/context", {
                            method: "GET",
                            headers: {
                                "Accept": "application/json"
                            },
                            credentials: "include"
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error("Erro ao buscar contexto do sistema.");
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    context = _a.sent();
                    menu = getMenuByTenantType(context.tenantType);
                    container.innerHTML = buildSidebarHtml(menu, context);
                    return [3 /*break*/, 5];
                case 4:
                    error_1 = _a.sent();
                    console.error("Erro ao carregar sidebar:", error_1);
                    fallbackContext = {
                        systemMode: "PRODUCTION",
                        tenantType: "STANDARD"
                    };
                    container.innerHTML = buildSidebarHtml(STANDARD_MENU, fallbackContext);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
document.addEventListener("DOMContentLoaded", loadSidebar);
