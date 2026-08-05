    const API = '/api';
    const DEV_UNAUTHORIZED_MESSAGE = 'Acesso restrito ao Dev SuperAdmin.';
    const PUBLIC_PAGES = [
      { label: 'Dashboard', file: 'dashboard.html', href: 'dashboard.html' },
      { label: 'Produtos', file: 'produtos.html', href: 'produtos.html' },
      { label: 'Pedidos', file: 'pedido.html', href: 'pedido.html' },
      { label: 'Clientes Pet', file: 'clientePet.html', href: 'clientePet.html' },
      { label: 'Agenda Pet', file: 'agendaPet.html', href: 'agendaPet.html' },
      { label: 'Funcionarios', file: 'funcionario.html', href: 'funcionario.html' },
      { label: 'Fornecedores', file: 'fornecedor.html', href: 'fornecedor.html' },
      { label: 'Despesas', file: 'despesas.html', href: 'despesas.html' },
      { label: 'Caixa', file: 'caixa.html', href: 'caixa.html' },
      { label: 'Perfil', file: 'perfil.html', href: 'perfil.html' }
    ];

    const els = {
      statusBox: document.getElementById('statusBox'),
      sidebarPages: document.getElementById('sidebarPages'),
      pageGrid: document.getElementById('pageGrid'),
      logoutBtn: document.getElementById('logoutBtn'),
      openSystemBtn: document.getElementById('openSystemBtn'),
      refreshBtn: document.getElementById('refreshBtn'),
      systemTypeSelect: document.getElementById('systemTypeSelect'),
      userSearchInput: document.getElementById('userSearchInput'),
      periodFilter: document.getElementById('periodFilter'),
      usersUsageList: document.getElementById('usersUsageList'),
      usersUsageEmpty: document.getElementById('usersUsageEmpty'),
      railwayStatus: document.getElementById('railwayStatus'),
      railwayMessage: document.getElementById('railwayMessage'),
      railwayUsage: document.getElementById('railwayUsage'),
      railwayDeployments: document.getElementById('railwayDeployments'),
      supabaseStatus: document.getElementById('supabaseStatus'),
      supabaseMessage: document.getElementById('supabaseMessage'),
      databaseUsage: document.getElementById('databaseUsage'),
      databaseConnections: document.getElementById('databaseConnections'),
      activeUsers: document.getElementById('activeUsers'),
      totalAccesses: document.getElementById('totalAccesses'),
      updatedAt: document.getElementById('updatedAt'),
      selectedPeriodLabel: document.getElementById('selectedPeriodLabel')
    };

    let searchTimer = null;

    function setStatus(message) {
      els.statusBox.textContent = message;
      els.statusBox.style.borderColor = '#dbe5ef';
      els.statusBox.style.color = '#334';
      els.statusBox.style.background = '#fff';
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    async function requestJson(url, options = {}) {
      const response = await fetch(API + url, {
        credentials: 'include',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(DEV_UNAUTHORIZED_MESSAGE);
        }

        throw new Error(data.message || 'Requisicao recusada.');
      }

      return data;
    }

    function normalizeSystemType(value) {
      return String(value || '').trim().toLowerCase();
    }

    function branchSystemType(branch) {
      return normalizeSystemType(branch?.tenant?.systemType || branch?.systemType);
    }

    function normalizeBranch(branch) {
      if (!branch?.id || !branch?.tenantId) {
        return null;
      }

      const systemType = branchSystemType(branch);

      if (!systemType) {
        return null;
      }

      return {
        id: branch.id,
        name: branch.name,
        tenantId: branch.tenantId,
        systemType,
        isDevWorkspace: branch.isDevWorkspace === true,
        isSupportContext: branch.isSupportContext === true
      };
    }

    function getSelectedBranchFromWorkspaces(workspaces, selectedType) {
      const candidates = (Array.isArray(workspaces) ? workspaces : [])
        .map((workspace) => ({
          ...(workspace.selectedBranch || {}),
          systemType: workspace.systemType || workspace.selectedBranch?.systemType,
          isDevWorkspace: true
        }))
        .map(normalizeBranch)
        .filter(Boolean);

      const branch = candidates.find((item) =>
        item.systemType === selectedType && item.isDevWorkspace === true
      );

      if (!branch) {
        return null;
      }

      return branch;
    }

    function persistDevContext(selectedType, selectedBranch) {
      const payload = {
        selectedBranch,
        systemType: selectedType,
        mode: 'production',
        contextKind: 'dev-workspace',
        savedAt: new Date().toISOString()
      };

      sessionStorage.setItem(`nextstockDevContext:${selectedType}`, JSON.stringify(payload));
      sessionStorage.setItem('nextstockBackendMode', 'production');
      sessionStorage.setItem('nextstockSelectedBranch', JSON.stringify(selectedBranch));
      sessionStorage.setItem('nextstockTenantId', selectedBranch.tenantId);
      sessionStorage.setItem('nextstockBranchId', selectedBranch.id);
      sessionStorage.setItem('nextstockSelectedSystemType', selectedType);
      sessionStorage.setItem('nextstockSystemType', selectedType);
      sessionStorage.setItem('nextstockIsSuperAdmin', 'true');
      sessionStorage.setItem('nextstockIsDevSuperAdmin', 'true');
      sessionStorage.removeItem('nextstockDevSupportContext');
      sessionStorage.removeItem('nextstockIsPreview');
      sessionStorage.removeItem('nextstockPreviewMode');
    }

    function renderPages(pages) {
      els.sidebarPages.innerHTML = pages.map((page) => `
        <li>
          <a href="${escapeHtml(page.href)}">
            ${escapeHtml(page.label)}
          </a>
        </li>
      `).join('');

      els.pageGrid.innerHTML = pages.map((page) => `
        <a class="page-card" href="${escapeHtml(page.href)}">
          ${escapeHtml(page.label)}
          <span>${escapeHtml(page.file)}</span>
        </a>
      `).join('');
    }

    function formatBytes(value) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return 'Indisponivel';
      }

      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      let size = Number(value);
      let unitIndex = 0;

      while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
      }

      return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

    function formatDate(value) {
      if (!value) {
        return '-';
      }

      return new Date(value).toLocaleString('pt-BR');
    }

    function formatMetric(value) {
      return value === null || value === undefined || value === '' ? 'Indisponivel' : String(value);
    }

    function getPeriodLabel(period) {
      const labels = {
        day: 'Dia atual ate agora',
        today: 'Dia atual ate agora',
        week: 'Semana',
        weekly: 'Semana',
        month: 'Mes',
        monthly: 'Mes'
      };

      return labels[period] || 'Dia atual ate agora';
    }

    function formatMoneyCents(value) {
      if (value === null || value === undefined || Number.isNaN(Number(value))) {
        return 'Sem base de custo';
      }

      return (Number(value) / 100).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      });
    }

    function formatUsageEstimate(value) {
      if (!value || typeof value !== 'object') {
        return '0 unidades estimadas';
      }

      const units = Number(value.units || 0).toLocaleString('pt-BR', {
        maximumFractionDigits: 2
      });
      const share = Number(value.sharePercent || 0).toLocaleString('pt-BR', {
        maximumFractionDigits: 2
      });

      return `${units} unidades (${share}%)`;
    }

    function renderOverview(data) {
      const railway = data.railway || {};
      const supabase = data.supabase || {};
      const summary = data.usersSummary || {};

      els.railwayStatus.textContent = formatMetric(railway.status);
      els.railwayMessage.textContent = railway.message || 'Sem mensagem.';
      els.railwayUsage.textContent = `CPU ${formatMetric(railway.cpu)} / RAM ${formatMetric(railway.memory)}`;
      els.railwayDeployments.textContent = `Rede: ${formatMetric(railway.network)} | Deployments: ${(railway.deployments || []).length}`;

      els.supabaseStatus.textContent = formatMetric(supabase.status);
      els.supabaseMessage.textContent = supabase.message || 'Sem mensagem.';
      els.databaseUsage.textContent = formatBytes(supabase.databaseSize);
      els.databaseConnections.textContent = `Conexoes: ${formatMetric(supabase.activeConnections)} | Storage: ${formatBytes(supabase.storageUsed)}`;

      els.activeUsers.textContent = String(summary.activeUsers || 0);
      els.totalAccesses.textContent = `Total usuarios: ${summary.totalUsers || 0} | Eventos: ${summary.totalEvents || summary.totalAccesses || 0} | Peso: ${summary.totalWeight || 0}`;
      els.updatedAt.textContent = formatDate(data.updatedAt);
      els.selectedPeriodLabel.textContent = getPeriodLabel(data.period || els.periodFilter.value);
    }

    function renderUsersUsage(users, periodLabel) {
      if (!Array.isArray(users) || users.length === 0) {
        els.usersUsageList.innerHTML = '';
        els.usersUsageEmpty.style.display = 'block';
        return;
      }

      els.usersUsageEmpty.style.display = 'none';

      els.usersUsageList.innerHTML = users.map((user) => `
        <tr>
          <td>${escapeHtml(user.name || '-')}</td>
          <td>${escapeHtml(user.email || '-')}</td>
          <td>${escapeHtml(user.systemType || '-')}</td>
          <td>${escapeHtml(user.branchName || '-')}</td>
          <td>${escapeHtml(user.accessCount || 0)}</td>
          <td>${escapeHtml(user.eventWeight || 0)}</td>
          <td>${escapeHtml(formatDate(user.lastAccessAt))}</td>
          <td>${escapeHtml(formatUsageEstimate(user.serverUsage))}</td>
          <td>${escapeHtml(formatUsageEstimate(user.databaseUsage))}</td>
          <td>${escapeHtml(formatMoneyCents(user.estimatedCostCents))}</td>
          <td>${escapeHtml(periodLabel)}</td>
        </tr>
      `).join('');
    }

    async function loadDevOverview() {
      const period = els.periodFilter.value;
      const params = new URLSearchParams({ period });
      setStatus('Carregando resumo estimado...');
      const data = await requestJson(`/dev/overview?${params.toString()}`);

      renderOverview(data);
      sessionStorage.setItem('nextstockIsSuperAdmin', 'true');
      sessionStorage.setItem('nextstockIsDevSuperAdmin', 'true');
      setStatus('Dev SuperAdmin ativo. Dados reais carregados do backend.');
    }

    async function loadUsersUsage() {
      const search = els.userSearchInput.value.trim();
      const period = els.periodFilter.value;
      const params = new URLSearchParams({ period, search });
      setStatus('Carregando uso estimado dos usuarios...');
      const data = await requestJson(`/dev/users-usage?${params.toString()}`);

      renderUsersUsage(data.users || [], getPeriodLabel(period));
      setStatus('Uso estimado carregado. Valores calculados por atividade interna ponderada.');
    }

    function recordDevPageView() {
      void requestJson('/usage/page-view', {
        method: 'POST',
        body: JSON.stringify({
          page: 'dev.html',
          eventType: 'page_view'
        })
      }).catch(() => undefined);
    }

    async function loadDevMode() {
      try {
        await requestJson('/dev/health');
        document.body.classList.remove('dev-access-pending', 'dev-access-denied');
        recordDevPageView();
        renderPages(PUBLIC_PAGES);
        await Promise.all([loadDevOverview(), loadUsersUsage()]);
      } catch (error) {
        document.body.classList.remove('dev-access-pending');
        document.body.classList.add('dev-access-denied');
        renderUsersUsage([], getPeriodLabel(els.periodFilter.value));
        setStatus(error.message);
      }
    }

    async function refreshDevData() {
      try {
        await Promise.all([loadDevOverview(), loadUsersUsage()]);
      } catch (error) {
        setStatus(error.message);
      }
    }

    els.openSystemBtn.addEventListener('click', async () => {
      const selectedType = els.systemTypeSelect.value;

      try {
        const workspaceResponse = await requestJson('/dev/workspaces');
        const selectedBranch = getSelectedBranchFromWorkspaces(
          workspaceResponse.workspaces,
          selectedType
        );

        if (!selectedBranch) {
          setStatus(
            selectedType === 'petshop'
              ? 'Workspace Dev Pet Shop nao encontrado. Configure o contexto Dev deste modo.'
              : 'Workspace Dev padrao nao encontrado. Configure o contexto Dev deste modo.'
          );
          return;
        }

        window.clearNextStockSessionState?.();
        persistDevContext(selectedType, selectedBranch);
      } catch (error) {
        setStatus(error.message);
        return;
      }

      const targetPage = selectedType === 'petshop'
        ? 'clientePet.html?systemType=petshop&mode=production'
        : 'produtos.html?systemType=padrao&mode=production';

      window.location.href = targetPage;
    });

    els.refreshBtn.addEventListener('click', () => {
      void refreshDevData();
    });

    els.periodFilter.addEventListener('change', () => {
      void refreshDevData();
    });

    els.userSearchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);

      searchTimer = setTimeout(() => {
        void loadUsersUsage().catch((error) => setStatus(error.message));
      }, 400);
    });

    els.logoutBtn.addEventListener('click', async () => {
      await requestJson('/auth/logout', { method: 'POST' }).catch(() => undefined);
      window.clearNextStockSessionState?.();

      window.location.href = 'index.html';
    });

    void loadDevMode();
  
