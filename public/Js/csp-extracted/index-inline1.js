    const API = '/api';
    const authErrorMessages = {
      auth_failed: 'NÃ£o foi possÃ­vel entrar com o Google. Tente novamente.',
    };
    const authErrorParams = new URLSearchParams(window.location.search);
    const authError = authErrorMessages[authErrorParams.get('auth_error') || '']
      ? authErrorParams.get('auth_error')
      : null;
    if (authErrorParams.has('auth_error')) {
      authErrorParams.delete('auth_error');
      const cleanQuery = authErrorParams.toString();
      window.history.replaceState({}, document.title, window.location.pathname + (cleanQuery ? `?${cleanQuery}` : '') + window.location.hash);
    }
    const referralCode = new URLSearchParams(window.location.search).get('ref');
    let referralReady = !referralCode;
    let referralSystemType = null;

    const PROMOTION_SELECTION_KEY = 'nextstockPromotionSelection';
    const PROMOTION_RESERVATION_KEY = 'nextstockPromotionReservation';
    const PROMOTION_RESERVATION_IDEMPOTENCY_KEY = 'nextstockPromotionReservationIdempotency';

    function readPromotionSelection() {
      try {
        const value = JSON.parse(sessionStorage.getItem(PROMOTION_SELECTION_KEY) || 'null');
        if (
          value?.campaignSlug === 'lancamento-2026' &&
          /^[a-z0-9-]+$/.test(value.planSlug || '') &&
          [1, 3, 6].includes(Number(value.periodMonths))
        ) {
          return value;
        }
      } catch {}
      return null;
    }

    function savePromotionSelectionFromUrl() {
      const params = new URLSearchParams(window.location.search);
      if (params.get('promo') !== 'lancamento-2026') return;
      const planSlug = params.get('plan') || '';
      const periodMonths = Number(params.get('period'));
      if (!/^[a-z0-9-]+$/.test(planSlug) || ![1, 3, 6].includes(periodMonths)) return;
      sessionStorage.setItem(PROMOTION_SELECTION_KEY, JSON.stringify({
        campaignSlug: 'lancamento-2026',
        planSlug,
        periodMonths,
        referralCode: referralCode || null,
        selectedAt: new Date().toISOString(),
      }));
    }

    savePromotionSelectionFromUrl();


    const googleLoginLink = document.getElementById('googleLoginLink');
    const googleLoginStatus = document.getElementById('googleLoginStatus');
    if (googleLoginLink) {
      googleLoginLink.addEventListener('click', (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) return;
        event.preventDefault();
        window.location.assign('/api/auth/google/start');
      });
      fetch(`${API}/auth/capabilities`, { credentials: 'same-origin' })
        .then((response) => {
          if (!response.ok) throw new Error('Google OAuth capability check failed');
          return response.json();
        })
        .then((capabilities) => {
          if (capabilities?.googleOAuthEnabled === true) {
            googleLoginLink.hidden = false;
            if (googleLoginStatus) googleLoginStatus.hidden = true;
            return;
          }
          if (googleLoginStatus) {
            googleLoginStatus.textContent = 'Login com Google não está habilitado neste ambiente.';
            googleLoginStatus.hidden = false;
          }
        })
        .catch(() => {
          googleLoginLink.hidden = true;
          if (googleLoginStatus) {
            googleLoginStatus.textContent = 'Não foi possível verificar o login com Google.';
            googleLoginStatus.hidden = false;
          }
        });
    }

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

    function showAuthError() {
      if (authError) setStatus(authErrorMessages[authError], true);
    }
    showAuthError();

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

    async function reservePromotionSelection(selection) {
      const idempotencyKey =
        sessionStorage.getItem(PROMOTION_RESERVATION_IDEMPOTENCY_KEY) ||
        crypto.randomUUID();
      sessionStorage.setItem(PROMOTION_RESERVATION_IDEMPOTENCY_KEY, idempotencyKey);

      try {
        const { data } = await apiRequest(
          '/promotions/' + encodeURIComponent(selection.campaignSlug) + '/reservation',
          {
            method: 'POST',
            headers: { 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify({
              planSlug: selection.planSlug,
              periodMonths: selection.periodMonths,
            }),
          },
        );
        sessionStorage.setItem(PROMOTION_RESERVATION_KEY, JSON.stringify(data));
        sessionStorage.removeItem(PROMOTION_RESERVATION_IDEMPOTENCY_KEY);
        return true;
      } catch (error) {
        sessionStorage.setItem(
          PROMOTION_RESERVATION_KEY,
          JSON.stringify({ status: 'FAILED', message: error.message }),
        );
        return false;
      }
    }

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

      if (!/^[A-Za-z0-9]{6,128}$/.test(password)) {
        setStatus('Erro no cadastro:\n\nA senha deve ter entre 6 e 128 caracteres e aceitar apenas letras e numeros.', true);
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

        const promotionSelection = readPromotionSelection();
        persistAuthContext(data);
        if (promotionSelection) {
          sessionStorage.setItem(
            PROMOTION_SELECTION_KEY,
            JSON.stringify(promotionSelection),
          );
          const reserved = await reservePromotionSelection(promotionSelection);
          if (!reserved) {
            setStatus(
              'Cadastro concluído, mas a vaga promocional não pôde ser reservada. A campanha pode ter encerrado; verifique o perfil.',
              true,
            );
            window.location.href = 'perfil.html?promotion=reservation-failed';
            return;
          }
          setStatus('Cadastro concluído e vaga promocional reservada.');
          window.location.href = 'perfil.html?promotionCheckout=1';
          return;
        }
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
  
