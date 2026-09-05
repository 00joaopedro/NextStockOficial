    const API = '/api';
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    let referralReady = !referralCode;
    let referralSystemType = null;

    const previewBtn = document.getElementById('previewBtn');
    const previewOptions = document.getElementById('previewOptions');
    const standardPreviewBtn = document.getElementById('standardPreviewBtn');
    const petPreviewBtn = document.getElementById('petPreviewBtn');
    const standardPreviewFields = document.getElementById('standardPreviewFields');
    const petPreviewFields = document.getElementById('petPreviewFields');

    document.querySelectorAll('.password-toggle').forEach((toggle) => {
      toggle.addEventListener('click', () => {
        const passwordInput = document.getElementById(toggle.dataset.passwordTarget);
        const shouldShowPassword = passwordInput.type === 'password';

        passwordInput.type = shouldShowPassword ? 'text' : 'password';
        toggle.textContent = shouldShowPassword ? 'Ocultar' : 'Mostrar';
        toggle.setAttribute('aria-pressed', String(shouldShowPassword));
      });
    });

    previewBtn.addEventListener('click', () => {
      previewOptions.classList.toggle('active');
    });

    standardPreviewBtn.addEventListener('click', () => {
      standardPreviewFields.classList.add('active');
      petPreviewFields.classList.remove('active');
    });

    petPreviewBtn.addEventListener('click', () => {
      petPreviewFields.classList.add('active');
      standardPreviewFields.classList.remove('active');
    });

    function setStatus(message, isError = false) {
      const box = document.getElementById('statusBox');
      box.textContent = message;
      box.style.background = isError
        ? 'rgba(180, 30, 30, 0.35)'
        : 'rgba(255,255,255,0.18)';
    }

    async function safeJson(res) {
      const text = await res.text();

      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }

    function extractMessage(data) {
      if (!data) return 'Sem resposta.';
      if (typeof data === 'string') return data;
      if (data.message) return Array.isArray(data.message) ? data.message.join('\n') : data.message;
      if (data.error) return data.error;
      return JSON.stringify(data, null, 2);
    }

    function extractApiErrorMessage(status, data) {
      if (status === 401) return 'E-mail ou senha invalidos.';
      if (status === 409) return extractMessage(data) || 'Cadastro ou login incompleto. Solicite suporte.';
      if (status === 422) return extractMessage(data) || 'Dados invalidos. Revise as informacoes e tente novamente.';
      if (status === 503) return 'Sistema temporariamente indisponivel. Tente novamente em instantes.';
      if (status >= 500) return 'Erro interno. Tente novamente em instantes.';
      return extractMessage(data);
    }

    function isSuperAdminUser(user) {
      return user?.role === 'superAdmin' ||
        user?.roles?.includes?.('superAdmin') === true ||
        user?.isSuperAdmin === true ||
        user?.is_super_admin === true;
    }

    function clearRuntimeContext() {
      if (typeof window.clearNextStockSessionState === 'function') {
        window.clearNextStockSessionState();
        return;
      }

      sessionStorage.clear();
    }

    function persistAuthContext(data) {
      clearRuntimeContext();

      if (data.selectedBranch) {
        const systemType = data.selectedBranch.systemType || 'padrao';
        sessionStorage.setItem('nextstockSelectedBranch', JSON.stringify(data.selectedBranch));
        sessionStorage.setItem('nextstockTenantId', data.selectedBranch.tenantId || '');
        sessionStorage.setItem('nextstockBranchId', data.selectedBranch.id || '');
        sessionStorage.setItem('nextstockSystemType', systemType);
        sessionStorage.setItem('nextstockSelectedSystemType', systemType);
      }

      sessionStorage.setItem('nextstockBackendMode', 'production');
      sessionStorage.setItem('nextstockAuthenticatedUser', JSON.stringify(data.user || null));

      if (isSuperAdminUser(data.user)) {
        sessionStorage.setItem('nextstockIsSuperAdmin', 'true');
        sessionStorage.setItem('nextstockSystemType', 'padrao');
        sessionStorage.setItem('nextstockSelectedSystemType', 'padrao');
      }
    }

    function persistPreviewContext(systemType) {
      clearRuntimeContext();
      sessionStorage.setItem('nextstockPreviewMode', 'true');
      sessionStorage.setItem('nextstockIsPreview', 'true');
      sessionStorage.setItem('nextstockBackendMode', 'preview');
      sessionStorage.setItem('nextstockSystemType', systemType);
      sessionStorage.setItem('nextstockSelectedSystemType', systemType);
    }

    async function apiRequest(url, options = {}) {
      const res = await fetch(API + url, {
        credentials: 'include',
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      });
      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(extractApiErrorMessage(res.status, data));
      }

      return { res, data };
    }

    async function validateReferralLink() {
      if (!referralCode) return;

      try {
        const { data } = await apiRequest(
          '/referrals/' + encodeURIComponent(referralCode) + '/context',
          { method: 'GET' }
        );
        referralSystemType = data.systemType;
        referralReady = true;
        const systemTypeInput = document.getElementById('registerSystemType');
        systemTypeInput.value = referralSystemType;
        systemTypeInput.disabled = true;
        setStatus('Link de indicação validado. Faça seu cadastro.');
      } catch {
        referralReady = false;
        setStatus('Link de indicação inválido ou indisponível.', true);
      }
    }

    document.getElementById('standardPreviewLink').addEventListener('click', () => {
      persistPreviewContext('padrao');
    });

    document.getElementById('petPreviewLink').addEventListener('click', () => {
      persistPreviewContext('petshop');
    });

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!referralReady) {
        setStatus('Link de indicação inválido ou indisponível.', true);
        return;
      }

      const email = document.getElementById('registerEmail').value.trim();
      const name = document.getElementById('registerName').value.trim();
      const companyName = document.getElementById('registerCompanyName').value.trim();
      const password = document.getElementById('registerPassword').value;
      const systemType = referralSystemType || document.getElementById('registerSystemType').value;

      if (!/^[A-Za-z0-9]{12,}$/.test(password)) {
        setStatus('Erro no cadastro:\n\nA senha deve ter no minimo 12 digitos e nao pode conter simbolos.', true);
        return;
      }

      try {
        setStatus('Realizando cadastro...');
        const { data } = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            email,
            name,
            companyName,
            password,
            systemType,
            ...(referralCode ? { referralCode } : {})
          })
        });

        persistAuthContext(data);
        setStatus('Cadastro realizado com sucesso.');
        window.location.href = data.redirectTo || 'produtos.html';
      } catch (error) {
        setStatus('Erro no cadastro:\n\n' + error.message, true);
      }
    });

    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      try {
        setStatus('Realizando login...');
        const { data } = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password })
        });

        persistAuthContext(data);
        setStatus('Login realizado com sucesso.');
        window.location.href = data.redirectTo || 'produtos.html';
      } catch (error) {
        setStatus('Erro no login:\n\n' + error.message, true);
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        setStatus('Encerrando sessao...');
        const { data } = await apiRequest('/auth/logout', { method: 'POST' });
        clearRuntimeContext();
        setStatus('Logout realizado.\n\n' + extractMessage(data));
      } catch (error) {
        setStatus('Erro no logout:\n\n' + error.message, true);
      }
    });

    document.getElementById('profileBtn').addEventListener('click', async () => {
      try {
        setStatus('Consultando sessao atual...');
        const { data } = await apiRequest('/auth/profile', { method: 'GET' });
        setStatus('Sessao ativa:\n\n' + JSON.stringify(data, null, 2));
      } catch (error) {
        setStatus('Sessao nao encontrada ou usuario nao autenticado.\n\n' + error.message, true);
      }
    });

    document.getElementById('resetForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = document.getElementById('resetEmail').value.trim();

      try {
        setStatus('Enviando solicitacao de troca de senha...');
        const { data } = await apiRequest('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email })
        });

        setStatus('Solicitacao enviada.\n\n' + extractMessage(data));
        window.location.hash = '';
      } catch (error) {
        setStatus('Erro ao solicitar troca de senha.\n\n' + error.message, true);
      }
    });

    window.addEventListener('load', async () => {
      await validateReferralLink();
      try {
        const res = await fetch(API, {
          method: 'GET',
          credentials: 'include'
        });

        setStatus(res.ok
          ? 'Aplicacao online. Backend NestJS respondendo normalmente.'
          : 'Frontend carregado, mas o backend respondeu com status ' + res.status + '.',
          !res.ok
        );
      } catch (error) {
        setStatus('Frontend carregado, mas nao foi possivel alcancar o backend.\n\n' + error.message, true);
      }
    });
  
