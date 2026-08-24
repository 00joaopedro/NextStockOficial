type SystemMode = 'PRODUCTION' | 'PREVIEW';
type TenantType = 'STANDARD' | 'PETSHOP';
type ModuleKey = 'core' | 'petshop' | 'dev';

interface SystemContextResponse {
  systemMode: SystemMode;
  tenantType: TenantType;
  mode?: string;
  systemType?: string;
  isSuperAdmin?: boolean;
  is_super_admin?: boolean;
  isDevSuperAdmin?: boolean;
  allowedSystemTypes?: string[];
  billingAllowed?: boolean;
  role?: 'superAdmin' | 'Admin' | 'Vendedor' | 'Comprador';
  selectedBranch?: {
    id: string;
    name: string;
    tenantId: string;
    systemType: string;
  };
}

interface SidebarItem {
  label: string;
  href: string;
  key: string;
  module: ModuleKey;
  disabled?: boolean;
}

interface SidebarSnapshot {
  schemaVersion: number;
  generatedAt: number;
  expiresAt: number;
  scope: { tenantId: string | null; branchId: string | null; mode: string | null; systemType: string | null; role: string | null };
  context: SystemContextResponse;
  menu: SidebarItem[];
}

const SYSTEM_CONTEXT_ENDPOINT = '/api/system/context';
const BILLING_ENDPOINT = '/api/billing/subscription';
const PAGE_VIEW_ENDPOINT = '/api/usage/page-view';
const SIDEBAR_CACHE_KEY = 'nextstock.sidebar.snapshot';
const SIDEBAR_CACHE_SCHEMA = 1;
const SIDEBAR_CACHE_TTL_MS = 3 * 60 * 1000;

const FALLBACK_CONTEXT: SystemContextResponse = {
  systemMode: 'PREVIEW',
  tenantType: 'STANDARD',
};

const TENANT_MODULES: Record<TenantType, ModuleKey[]> = {
  STANDARD: ['core'],
  PETSHOP: ['core', 'petshop'],
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: 'Dev', href: 'dev.html', key: 'dev', module: 'dev' },
  {
    label: 'Parceiros',
    href: 'parceiros.html',
    key: 'parceiros',
    module: 'dev',
  },
  { label: 'Caixa', href: 'caixa.html', key: 'caixa', module: 'core' },
  { label: 'Perfil', href: 'perfil.html', key: 'perfil', module: 'core' },
  {
    label: 'Agenda',
    href: 'agendaPet.html',
    key: 'agendaPet',
    module: 'petshop',
  },
  {
    label: 'Clientes',
    href: 'clientePet.html',
    key: 'clientePet',
    module: 'petshop',
  },
  { label: 'Guia', href: 'guia.html', key: 'guia', module: 'core' },
  { label: 'Produtos', href: 'produtos.html', key: 'produtos', module: 'core' },
  { label: 'Pedidos', href: 'pedido.html', key: 'pedido', module: 'core' },
  {
    label: 'Fornecedores',
    href: 'fornecedor.html',
    key: 'fornecedor',
    module: 'core',
  },
  { label: 'Cadastro', href: 'cadastro.html', key: 'cadastro', module: 'core' },
  { label: 'Migração', href: 'migracao.html', key: 'migracao', module: 'core' },
  { label: 'Despesas', href: 'despesas.html', key: 'despesas', module: 'core' },
  {
    label: 'Histórico',
    href: 'historico.html',
    key: 'historico',
    module: 'core',
  },
  {
    label: 'Fechamento',
    href: 'fechamento.html',
    key: 'fechamento',
    module: 'core',
  },
  {
    label: 'Dashboard',
    href: 'dashboard.html',
    key: 'dashboard',
    module: 'core',
  },
  {
    label: 'Funcionários',
    href: 'funcionario.html',
    key: 'funcionario',
    module: 'core',
  },
  { label: 'NTF-e', href: 'ntfe.html', key: 'ntfe', module: 'core' },
  { label: 'Suporte', href: '#', key: 'suporte', module: 'core' },
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
    candidate?.role === 'superAdmin' ||
    candidate?.roles?.includes('superAdmin') === true ||
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
  if (document.getElementById('nextstock-sidebar-runtime-styles')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'nextstock-sidebar-runtime-styles';
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

    .preview-mode-notice {
      margin: -4px 12px 16px;
      padding: 9px;
      border-radius: 8px;
      background: rgba(255, 209, 102, 0.16);
      color: #fff;
      font-size: 12px;
      line-height: 1.35;
      text-align: center;
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
  return value === 'PRODUCTION' || value === 'PREVIEW';
}

function isTenantType(value: unknown): value is TenantType {
  return value === 'STANDARD' || value === 'PETSHOP';
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
    mode: candidate?.mode,
    systemType: candidate?.systemType,
    isSuperAdmin: isSuperAdminUser(candidate),
    is_super_admin: isSuperAdminUser(candidate),
    isDevSuperAdmin: isDevSuperAdminUser(candidate),
    allowedSystemTypes: Array.isArray(candidate?.allowedSystemTypes)
      ? candidate.allowedSystemTypes
      : [],
    role: candidate?.role,
    selectedBranch: candidate?.selectedBranch,
  };
}

function getRuntimeFallbackContext(): SystemContextResponse {
  return FALLBACK_CONTEXT;
}

function getSelectedBranchId(): string | null {
  try {
    const branch = JSON.parse(
      sessionStorage.getItem('nextstockSelectedBranch') || 'null',
    ) as { id?: string } | null;

    return branch?.id || sessionStorage.getItem('nextstockBranchId');
  } catch {
    return sessionStorage.getItem('nextstockBranchId');
  }
}

function getSelectedTenantId(): string | null {
  try {
    const branch = JSON.parse(sessionStorage.getItem('nextstockSelectedBranch') || 'null') as { tenantId?: string } | null;
    return branch?.tenantId || sessionStorage.getItem('nextstockTenantId');
  } catch {
    return sessionStorage.getItem('nextstockTenantId');
  }
}

function markSidebarPerformance(name: string): void {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') performance.mark(name);
}

function snapshotScope(context: Partial<SystemContextResponse> = {}) {
  return {
    tenantId: context.selectedBranch?.tenantId || getSelectedTenantId(),
    branchId: context.selectedBranch?.id || getSelectedBranchId(),
    mode: context.mode || sessionStorage.getItem('nextstockBackendMode'),
    systemType: context.systemType || sessionStorage.getItem('nextstockSystemType'),
    role: context.role || null,
  };
}

function clearSidebarSnapshot(): void {
  try { sessionStorage.removeItem(SIDEBAR_CACHE_KEY); } catch { /* fail closed */ }
}

function readSidebarSnapshot(): SidebarSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SIDEBAR_CACHE_KEY);
    if (!raw) { markSidebarPerformance('nextstock-sidebar-cache-miss'); return null; }
    const candidate = JSON.parse(raw) as SidebarSnapshot;
    const scope = snapshotScope(candidate.context);
    const valid = candidate.schemaVersion === SIDEBAR_CACHE_SCHEMA &&
      candidate.expiresAt > Date.now() && raw.length <= 64 * 1024 &&
      Array.isArray(candidate.menu) && candidate.context &&
      (Object.keys(scope) as Array<keyof typeof scope>).every((key) => candidate.scope?.[key] === scope[key]);
    if (!valid) { clearSidebarSnapshot(); markSidebarPerformance('nextstock-sidebar-cache-miss'); return null; }
    markSidebarPerformance('nextstock-sidebar-cache-hit');
    return candidate;
  } catch {
    clearSidebarSnapshot();
    markSidebarPerformance('nextstock-sidebar-cache-miss');
    return null;
  }
}

function writeSidebarSnapshot(context: SystemContextResponse, menu: SidebarItem[]): void {
  try {
    const generatedAt = Date.now();
    const snapshot: SidebarSnapshot = {
      schemaVersion: SIDEBAR_CACHE_SCHEMA,
      generatedAt,
      expiresAt: generatedAt + SIDEBAR_CACHE_TTL_MS,
      scope: snapshotScope(context),
      context: normalizeContext(context),
      menu: menu.map(({ label, href, key, module }) => ({ label, href, key, module })),
    };
    const encoded = JSON.stringify(snapshot);
    if (encoded.length <= 64 * 1024) sessionStorage.setItem(SIDEBAR_CACHE_KEY, encoded);
  } catch { /* optional presentation cache */ }
}

(window as Window & { clearNextStockSidebarSnapshot?: () => void }).clearNextStockSidebarSnapshot = clearSidebarSnapshot;

function getDevContextHeader(
  selectedBranchId: string | null,
): Record<string, string> {
  if (!selectedBranchId) {
    return {};
  }

  try {
    const supportContext = JSON.parse(
      sessionStorage.getItem('nextstockDevSupportContext') || 'null',
    ) as { branchId?: string; mode?: string } | null;

    if (
      supportContext?.branchId === selectedBranchId &&
      supportContext.mode === 'support'
    ) {
      return { 'x-nextstock-dev-context': 'support' };
    }
  } catch {
    return {};
  }

  return {};
}

function getCurrentPageFileName(): string {
  const currentPath = window.location.pathname;
  const fileName = currentPath.substring(currentPath.lastIndexOf('/') + 1);

  return fileName || 'dashboard.html';
}

function getActiveKey(menu: SidebarItem[]): string {
  const currentFile = getCurrentPageFileName();
  const currentItem = menu.find((item) => item.href === currentFile);

  return currentItem?.key ?? '';
}

function getMenuByTenantType(tenantType: TenantType): SidebarItem[] {
  const enabledModules = new Set(TENANT_MODULES[tenantType]);

  return SIDEBAR_ITEMS.filter((item) => enabledModules.has(item.module));
}

function getMenuByContext(context: SystemContextResponse): SidebarItem[] {
  const roleItems: Record<string, Set<string>> = {
    Admin: new Set([
      'caixa',
      'perfil',
      'agendaPet',
      'clientePet',
      'guia',
      'produtos',
      'pedido',
      'fornecedor',
      'cadastro',
      'migracao',
      'despesas',
      'historico',
      'fechamento',
      'dashboard',
      'funcionario',
      'ntfe',
    ]),
    Vendedor: new Set([
      'caixa',
      'perfil',
      'agendaPet',
      'clientePet',
      'guia',
      'produtos',
      'pedido',
      'fornecedor',
      'historico',
      'dashboard',
      'ntfe',
    ]),
    Comprador: new Set([
      'perfil',
      'guia',
      'produtos',
      'fornecedor',
      'despesas',
      'dashboard',
    ]),
  };
  const allowed = context.role ? roleItems[context.role] : undefined;
  const contextMenu = getMenuByTenantType(context.tenantType).filter(
    (item) => !allowed || allowed.has(item.key),
  );

  if (context.billingAllowed === false && !isDevSuperAdminUser(context)) {
    return contextMenu.filter((item) => item.key === 'perfil');
  }

  if (isDevSuperAdminUser(context)) {
    return [
      ...contextMenu,
      ...SIDEBAR_ITEMS.filter((item) => item.module === 'dev'),
    ];
  }

  return contextMenu;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildPreviewBadge(context: SystemContextResponse): string {
  if (context.systemMode !== 'PREVIEW') {
    return '';
  }

  return '<span class="system-mode-badge" aria-label="Modo visualização">VISUALIZAÇÃO</span>';
}

function buildSidebarItemHtml(item: SidebarItem, activeKey: string): string {
  const activeClass = item.key === activeKey ? ' active' : '';
  const disabledClass = item.disabled ? ' disabled' : '';
  const ariaCurrent = item.key === activeKey ? ' aria-current="page"' : '';
  const ariaDisabled = item.disabled ? ' aria-disabled="true"' : '';
  const href = item.disabled ? '#' : item.href;

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
    .join('');

  return `
    <aside id="sidebar" class="sidebar" data-system-mode="${context.systemMode}" data-tenant-type="${context.tenantType}">
      <div class="sidebar-brand">
        <h2>NextStock</h2>
        ${buildPreviewBadge(context)}
      </div>
      ${
        context.systemMode === 'PREVIEW'
          ? '<p class="preview-mode-notice">Você pode navegar e consultar dados, mas alterações estão bloqueadas.</p>'
          : ''
      }

      <ul class="menu">
        ${menuHtml}
      </ul>
    </aside>
  `;
}

async function fetchSystemContext(): Promise<SystemContextResponse> {
  const publicPreview = (window as any).getNextStockPublicPreviewContext?.();
  if (publicPreview) {
    return normalizeContext(publicPreview);
  }

  const selectedBranchId = getSelectedBranchId();
  markSidebarPerformance('nextstock-sidebar-context-start');
  const response = await fetch(SYSTEM_CONTEXT_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(selectedBranchId
        ? { 'x-nextstock-branch-id': selectedBranchId }
        : {}),
      ...getDevContextHeader(selectedBranchId),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) clearSidebarSnapshot();
    throw new Error(`System context failed with status ${response.status}`);
  }

  const context = normalizeContext(await response.json());
  if (
    context.systemMode === 'PREVIEW' &&
    !context.systemType &&
    !context.selectedBranch &&
    (window as any).isNextStockDemoMode?.()
  ) {
    const selected = sessionStorage.getItem('nextstockSelectedSystemType');
    if (selected === 'petshop') {
      context.tenantType = 'PETSHOP';
      context.systemType = 'petshop';
    }
  }
  markSidebarPerformance('nextstock-sidebar-context-ready');
  return context;
}

async function fetchBilling(context: SystemContextResponse): Promise<SystemContextResponse> {
  markSidebarPerformance('nextstock-sidebar-billing-start');
  const selectedBranchId = getSelectedBranchId();
  const billingResponse = await fetch(BILLING_ENDPOINT, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...(selectedBranchId
        ? { 'x-nextstock-branch-id': selectedBranchId }
        : {}),
      ...getDevContextHeader(selectedBranchId),
    },
    credentials: 'include',
  });

  if (billingResponse.status === 401 || billingResponse.status === 403) {
    clearSidebarSnapshot();
    throw new Error(`Billing failed with status ${billingResponse.status}`);
  }
  if (billingResponse.ok) {
    const billing = await billingResponse.json();
    context.billingAllowed =
      billing?.enforcementEnabled !== true ||
      billing?.entitlement?.allowed !== false;
  }
  markSidebarPerformance('nextstock-sidebar-billing-ready');
  return context;
}

function renderSidebar(
  container: HTMLElement,
  context: SystemContextResponse,
  menuOverride?: SidebarItem[],
): void {
  injectSidebarStyles();

  const menu = menuOverride || getMenuByContext(context);
  container.innerHTML = buildSidebarHtml(menu, context);
  document.documentElement.dataset.systemMode = context.systemMode;
  document.documentElement.dataset.tenantType = context.tenantType;
  (window as any).setNextStockBackendContext?.(context);
  applyPreviewUi(context);
}

function applyPreviewUi(context: SystemContextResponse): void {
  if (context.systemMode !== 'PREVIEW') return;

  const mutationId =
    /(save|salvar|create|criar|add|adicionar|edit|editar|delete|deletar|remove|apagar|upload|import|emit|finalizar|checkout|sync|reset|ativar|desativar|generate|gerar|vender)/i;
  document
    .querySelectorAll<HTMLElement>(
      'button, input[type="submit"], input[type="file"]',
    )
    .forEach((element) => {
      const marker = `${element.id} ${element.getAttribute('name') || ''} ${
        element.getAttribute('data-action') || ''
      }`;
      if (!mutationId.test(marker)) return;
      (element as HTMLButtonElement | HTMLInputElement).disabled = true;
      element.setAttribute('aria-disabled', 'true');
      element.setAttribute('title', 'Modo visualização: ação bloqueada.');
    });
}

function showPreviewToast(message: string): void {
  let toast = document.getElementById('nextstock-preview-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'nextstock-preview-toast';
    Object.assign(toast.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      zIndex: '100000',
      maxWidth: '360px',
      padding: '12px 16px',
      borderRadius: '10px',
      background: '#071b31',
      color: '#fff',
      boxShadow: '0 8px 30px rgba(0,0,0,.28)',
    });
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  window.setTimeout(() => {
    if (toast) toast.hidden = true;
  }, 4500);
}

window.addEventListener('nextstock:preview-blocked', (event) => {
  const detail = (event as CustomEvent<{ message?: string }>).detail;
  showPreviewToast(detail?.message || 'Modo visualização: ação bloqueada.');
});

function recordPageView(context: SystemContextResponse): void {
  if (context.systemMode !== 'PRODUCTION') {
    return;
  }

  void fetch(PAGE_VIEW_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      ...(getSelectedBranchId()
        ? { 'x-nextstock-branch-id': getSelectedBranchId() as string }
        : {}),
      ...getDevContextHeader(getSelectedBranchId()),
    },
    body: JSON.stringify({
      page: getCurrentPageFileName(),
      eventType: 'page_view',
    }),
  }).catch(() => undefined);
}

async function loadSidebar(): Promise<void> {
  const container = document.getElementById('sidebar-container');

  if (!container) {
    return;
  }

  markSidebarPerformance('nextstock-sidebar-script-start');
  const snapshot = readSidebarSnapshot();
  if (snapshot) {
    renderSidebar(container, snapshot.context, snapshot.menu);
    container.querySelector('#sidebar')?.setAttribute('data-sidebar-state', 'revalidating');
    markSidebarPerformance('nextstock-sidebar-first-menu');
  } else {
    injectSidebarStyles();
    container.innerHTML = '<aside id="sidebar" class="sidebar sidebar-loading" aria-busy="true"><div class="sidebar-brand"><h2>NextStock</h2></div><ul class="menu"><li class="menu-item"><a href="perfil.html">Perfil</a></li></ul></aside>';
    markSidebarPerformance('nextstock-sidebar-shell');
  }

  try {
    const context = await fetchSystemContext();
    const provisional = snapshot
      ? getMenuByContext({ ...context, billingAllowed: snapshot.context.billingAllowed })
      : getMenuByContext({ ...context, billingAllowed: false });
    renderSidebar(container, context, provisional);
    markSidebarPerformance('nextstock-sidebar-first-menu');
    void fetchBilling(context).then((resolved) => {
      const menu = getMenuByContext(resolved);
      renderSidebar(container, resolved, menu);
      writeSidebarSnapshot(resolved, menu);
      container.querySelector('#sidebar')?.setAttribute('aria-busy', 'false');
      markSidebarPerformance('nextstock-sidebar-ready');
      recordPageView(resolved);
    }).catch(() => {
      container.querySelector('#sidebar')?.setAttribute('aria-busy', 'false');
      markSidebarPerformance('nextstock-sidebar-ready');
    });
  } catch (error) {
    clearSidebarSnapshot();
    console.warn('Using fallback sidebar context.', error);
    const context = { ...getRuntimeFallbackContext() };
    const selected = sessionStorage.getItem('nextstockSelectedSystemType');
    if ((window as any).isNextStockDemoMode?.() && selected === 'petshop') {
      context.tenantType = 'PETSHOP';
      context.systemType = 'petshop';
    }
    renderSidebar(container, context);
    container.querySelector('#sidebar')?.setAttribute('aria-busy', 'false');
    markSidebarPerformance('nextstock-sidebar-ready');
    recordPageView(context);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadSidebar);
} else {
  void loadSidebar();
}

export {};
