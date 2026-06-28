type SystemMode = "PRODUCTION" | "PREVIEW";
type TenantType = "STANDARD" | "PETSHOP";
type ModuleKey = "core" | "petshop" | "dev";

interface SystemContextResponse {
  systemMode: SystemMode;
  tenantType: TenantType;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
  isDevSuperAdmin?: boolean;
  allowedSystemTypes?: string[];
  billingAllowed?: boolean;
}

interface SidebarItem {
  label: string;
  href: string;
  key: string;
  module: ModuleKey;
  disabled?: boolean;
}

const SYSTEM_CONTEXT_ENDPOINT = "/api/system/context";
const PAGE_VIEW_ENDPOINT = "/api/usage/page-view";

const FALLBACK_CONTEXT: SystemContextResponse = {
  systemMode: "PREVIEW",
  tenantType: "STANDARD",
};

const TENANT_MODULES: Record<TenantType, ModuleKey[]> = {
  STANDARD: ["core"],
  PETSHOP: ["core", "petshop"],
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: "Dev", href: "dev.html", key: "dev", module: "dev" },
  { label: "Parceiros", href: "parceiros.html", key: "parceiros", module: "dev" },
  { label: "Caixa", href: "caixa.html", key: "caixa", module: "core" },
  { label: "Perfil", href: "perfil.html", key: "perfil", module: "core" },
  { label: "Agenda", href: "agendaPet.html", key: "agendaPet", module: "petshop" },
  { label: "Clientes", href: "clientePet.html", key: "clientePet", module: "petshop" },
  { label: "Guia", href: "guia.html", key: "guia", module: "core" },
  { label: "Produtos", href: "produtos.html", key: "produtos", module: "core" },
  { label: "Pedidos", href: "pedido.html", key: "pedido", module: "core" },
  { label: "Fornecedores", href: "fornecedor.html", key: "fornecedor", module: "core" },
  { label: "Cadastro", href: "cadastro.html", key: "cadastro", module: "core" },
  { label: "Migração", href: "migracao.html", key: "migracao", module: "core" },
  { label: "Despesas", href: "despesas.html", key: "despesas", module: "core" },
  { label: "Histórico", href: "historico.html", key: "historico", module: "core" },
  { label: "Fechamento", href: "fechamento.html", key: "fechamento", module: "core" },
  { label: "Dashboard", href: "dashboard.html", key: "dashboard", module: "core" },
  { label: "Pagamento", href: "pagamentos.html", key: "pagamentos", module: "core" },
  { label: "Funcionários", href: "funcionario.html", key: "funcionario", module: "core" },
  { label: "NTF-e", href: "ntfe.html", key: "ntfe", module: "core" },
  { label: "Suporte", href: "#", key: "suporte", module: "core" },
];

declare global {
  interface Window {
    NextStockAccess?: {
      isSuperAdminUser: (user?: unknown) => boolean;
      isDevSuperAdminUser: (user?: unknown) => boolean;
      canAccessEverything: (user?: unknown) => boolean;
      canAccessDev: (user?: unknown) => boolean;
    };
  }
}

function isSuperAdminUser(user?: unknown): boolean {
  const candidate = user as
    | {
        role?: string;
        roles?: string[];
        isSuperAdmin?: boolean;
        is_super_admin?: boolean;
      }
    | null
    | undefined;

  return (
    candidate?.role === "superAdmin" ||
    candidate?.roles?.includes("superAdmin") === true ||
    candidate?.isSuperAdmin === true ||
    candidate?.is_super_admin === true
  );
}

function isDevSuperAdminUser(user?: unknown): boolean {
  const candidate = user as
    | {
        isDevSuperAdmin?: boolean;
      }
    | null
    | undefined;

  return candidate?.isDevSuperAdmin === true;
}

window.NextStockAccess = {
  isSuperAdminUser,
  isDevSuperAdminUser,
  canAccessEverything: isSuperAdminUser,
  canAccessDev: isDevSuperAdminUser,
};

function injectSidebarStyles(): void {
  if (document.getElementById("nextstock-sidebar-runtime-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "nextstock-sidebar-runtime-styles";
  style.textContent = `
    .sidebar-brand {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 0 12px;
      margin-bottom: 16px;
      text-align: center;
    }

    .sidebar-brand h2 {
      margin-bottom: 0;
    }

    .system-mode-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 22px;
      padding: 3px 9px;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 999px;
      background: #ffd166;
      color: #071b31;
      font-size: 11px;
      font-weight: 900;
      letter-spacing: 0;
      line-height: 1;
    }

    .sidebar .menu-item > a {
      display: block;
      color: inherit;
      text-decoration: none;
    }

    .sidebar .menu-item.active,
    .sidebar .menu-item:hover {
      background: var(--cyan, #00cfcf);
      color: var(--blue-900, #0d1b2a);
      font-weight: 800;
    }

    .sidebar .menu-item.disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .sidebar .menu-item.disabled > a {
      pointer-events: none;
    }
  `;

  document.head.appendChild(style);
}

function isSystemMode(value: unknown): value is SystemMode {
  return value === "PRODUCTION" || value === "PREVIEW";
}

function isTenantType(value: unknown): value is TenantType {
  return value === "STANDARD" || value === "PETSHOP";
}

function normalizeContext(value: unknown): SystemContextResponse {
  const candidate = value as Partial<SystemContextResponse> | null;

  return {
    systemMode: isSystemMode(candidate?.systemMode)
      ? candidate.systemMode
      : FALLBACK_CONTEXT.systemMode,
    tenantType: isTenantType(candidate?.tenantType)
      ? candidate.tenantType
      : FALLBACK_CONTEXT.tenantType,
    isSuperAdmin: isSuperAdminUser(candidate),
    is_super_admin: isSuperAdminUser(candidate),
    isDevSuperAdmin: isDevSuperAdminUser(candidate),
    allowedSystemTypes: Array.isArray(candidate?.allowedSystemTypes)
      ? candidate.allowedSystemTypes
      : [],
  };
}

function getRuntimeFallbackContext(): SystemContextResponse {
  return FALLBACK_CONTEXT;
}

function getSelectedBranchId(): string | null {
  try {
    const branch = JSON.parse(
      sessionStorage.getItem("nextstockSelectedBranch") || "null",
    ) as { id?: string } | null;

    return branch?.id || sessionStorage.getItem("nextstockBranchId");
  } catch {
    return sessionStorage.getItem("nextstockBranchId");
  }
}

function getDevContextHeader(selectedBranchId: string | null): Record<string, string> {
  if (!selectedBranchId) {
    return {};
  }

  try {
    const supportContext = JSON.parse(
      sessionStorage.getItem("nextstockDevSupportContext") || "null",
    ) as { branchId?: string; mode?: string } | null;

    if (supportContext?.branchId === selectedBranchId && supportContext.mode === "support") {
      return { "x-nextstock-dev-context": "support" };
    }
  } catch {
    return {};
  }

  return {};
}

function getCurrentPageFileName(): string {
  const currentPath = window.location.pathname;
  const fileName = currentPath.substring(currentPath.lastIndexOf("/") + 1);

  return fileName || "dashboard.html";
}

function getActiveKey(menu: SidebarItem[]): string {
  const currentFile = getCurrentPageFileName();
  const currentItem = menu.find((item) => item.href === currentFile);

  return currentItem?.key ?? "";
}

function getMenuByTenantType(tenantType: TenantType): SidebarItem[] {
  const enabledModules = new Set(TENANT_MODULES[tenantType]);

  return SIDEBAR_ITEMS.filter((item) => enabledModules.has(item.module));
}

function getMenuByContext(context: SystemContextResponse): SidebarItem[] {
  const contextMenu = getMenuByTenantType(context.tenantType);

  if (context.billingAllowed === false && !isDevSuperAdminUser(context)) {
    return contextMenu.filter((item) => item.key === "perfil");
  }

  if (isDevSuperAdminUser(context)) {
    return [
      ...contextMenu,
      ...SIDEBAR_ITEMS.filter((item) => item.module === "dev"),
    ];
  }

  return contextMenu;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildPreviewBadge(context: SystemContextResponse): string {
  if (context.systemMode !== "PREVIEW") {
    return "";
  }

  return '<span class="system-mode-badge" aria-label="Modo preview">PREVIEW</span>';
}

function buildSidebarItemHtml(item: SidebarItem, activeKey: string): string {
  const activeClass = item.key === activeKey ? " active" : "";
  const disabledClass = item.disabled ? " disabled" : "";
  const ariaCurrent = item.key === activeKey ? ' aria-current="page"' : "";
  const ariaDisabled = item.disabled ? ' aria-disabled="true"' : "";
  const href = item.disabled ? "#" : item.href;

  return `
    <li class="menu-item${activeClass}${disabledClass}">
      <a href="${escapeHtml(href)}"${ariaCurrent}${ariaDisabled} data-sidebar-key="${escapeHtml(item.key)}">
        ${escapeHtml(item.label)}
      </a>
    </li>
  `;
}

function buildSidebarHtml(
  menu: SidebarItem[],
  context: SystemContextResponse,
): string {
  const activeKey = getActiveKey(menu);
  const menuHtml = menu
    .map((item) => buildSidebarItemHtml(item, activeKey))
    .join("");

  return `
    <aside id="sidebar" class="sidebar" data-system-mode="${context.systemMode}" data-tenant-type="${context.tenantType}">
      <div class="sidebar-brand">
        <h2>NextStock</h2>
        ${buildPreviewBadge(context)}
      </div>

      <ul class="menu">
        ${menuHtml}
      </ul>
    </aside>
  `;
}

async function fetchSystemContext(): Promise<SystemContextResponse> {
  const selectedBranchId = getSelectedBranchId();
  const response = await fetch(SYSTEM_CONTEXT_ENDPOINT, {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(selectedBranchId ? { "x-nextstock-branch-id": selectedBranchId } : {}),
      ...getDevContextHeader(selectedBranchId),
    },
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`System context failed with status ${response.status}`);
  }

  const context = normalizeContext(await response.json());
  const billingResponse = await fetch("/api/billing/subscription", {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(selectedBranchId ? { "x-nextstock-branch-id": selectedBranchId } : {}),
      ...getDevContextHeader(selectedBranchId),
    },
    credentials: "include",
  });

  if (billingResponse.ok) {
    const billing = await billingResponse.json();
    context.billingAllowed =
      billing?.enforcementEnabled !== true ||
      billing?.entitlement?.allowed !== false;
  }

  return context;
}

function renderSidebar(
  container: HTMLElement,
  context: SystemContextResponse,
): void {
  injectSidebarStyles();

  const menu = getMenuByContext(context);
  container.innerHTML = buildSidebarHtml(menu, context);
  document.documentElement.dataset.systemMode = context.systemMode;
  document.documentElement.dataset.tenantType = context.tenantType;
}

function recordPageView(context: SystemContextResponse): void {
  if (context.systemMode !== "PRODUCTION") {
    return;
  }

  void fetch(PAGE_VIEW_ENDPOINT, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: {
      "Content-Type": "application/json",
      ...(getSelectedBranchId()
        ? { "x-nextstock-branch-id": getSelectedBranchId() as string }
        : {}),
      ...getDevContextHeader(getSelectedBranchId()),
    },
    body: JSON.stringify({
      page: getCurrentPageFileName(),
      eventType: "page_view",
    }),
  }).catch(() => undefined);
}

async function loadSidebar(): Promise<void> {
  const container = document.getElementById("sidebar-container");

  if (!container) {
    return;
  }

  try {
    const context = await fetchSystemContext();
    renderSidebar(container, context);
    recordPageView(context);
  } catch (error) {
    console.warn("Using fallback sidebar context.", error);
    (window as any).clearNextStockSessionState?.();
    const context = getRuntimeFallbackContext();
    renderSidebar(container, context);
    recordPageView(context);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadSidebar);
} else {
  void loadSidebar();
}

export {};
