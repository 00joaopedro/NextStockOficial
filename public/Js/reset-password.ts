type Credentials = { token: string; accessToken: string; refreshToken: string; isSupabase: boolean };

const diagnostic = (code: string, error = false) => (error ? console.error : console.info)(code);

const setupPasswordToggle = (input: HTMLInputElement, toggle: HTMLButtonElement, fieldName: string) => {
  if (toggle.dataset.toggleInitialized === 'true') return;
  toggle.dataset.toggleInitialized = 'true';

  const updateToggle = () => {
    const visible = input.type === 'text';
    toggle.textContent = visible ? 'Esconder' : 'Mostrar';
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.setAttribute('aria-label', `${visible ? 'Esconder' : 'Mostrar'} ${fieldName}`);
  };

  toggle.addEventListener('click', () => {
    const selectionStart = input.selectionStart;
    const selectionEnd = input.selectionEnd;
    input.type = input.type === 'password' ? 'text' : 'password';
    updateToggle();
    input.focus();
    if (selectionStart !== null && selectionEnd !== null)
      input.setSelectionRange(selectionStart, selectionEnd);
  });

  updateToggle();
};

export const recoveryErrorMessage = (status: number, publicCode?: unknown) => {
  const code = typeof publicCode === 'string' ? publicCode : '';
  if (code === 'RECOVERY_REQUEST_INVALID') return 'A solicitação é inválida. Verifique os dados e tente novamente.';
  if (code === 'RECOVERY_LINK_INVALID') return 'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
  if (code === 'PASSWORD_POLICY_REJECTED') return 'A senha não atende às regras exigidas.';
  if (code === 'RECOVERY_PROVIDER_UNAVAILABLE') return 'Serviço temporariamente indisponível. Tente novamente.';
  switch (status) {
    case 400: return 'A solicitação é inválida. Verifique os dados e tente novamente.';
    case 401: return 'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
    case 422: return 'A senha não atende às regras exigidas.';
    case 503: return 'Serviço temporariamente indisponível. Tente novamente.';
    default: return 'Não foi possível redefinir a senha. Tente novamente.';
  }
};

const start = () => {
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const credentials: Credentials = {
    token: query.get('token') || '',
    accessToken: fragment.get('access_token') || '',
    refreshToken: fragment.get('refresh_token') || '',
    isSupabase: fragment.get('type') === 'recovery',
  };
  if (credentials.token || fragment.toString())
    window.history.replaceState({}, document.title, window.location.pathname);

  const form = document.querySelector<HTMLFormElement>('#reset-form');
  const message = document.querySelector<HTMLElement>('#message');
  const button = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  document.querySelectorAll<HTMLButtonElement>('[data-password-toggle]').forEach((toggle) => {
    const inputId = toggle.getAttribute('aria-controls');
    const input = inputId ? document.getElementById(inputId) : null;
    if (input instanceof HTMLInputElement)
      setupPasswordToggle(input, toggle, inputId === 'password' ? 'nova senha' : 'confirmação da senha');
  });
  const callbackValid = Boolean(credentials.token ||
    (credentials.isSupabase && credentials.accessToken && credentials.refreshToken));
  let isSubmitting = false;

  diagnostic('RECOVERY_PAGE_READY');
  if (!callbackValid) {
    diagnostic(fragment.toString() ? 'RECOVERY_TYPE_INVALID' : 'RECOVERY_CALLBACK_MISSING', true);
    if (message) message.textContent = 'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
    if (button) button.disabled = true;
  } else diagnostic('RECOVERY_CALLBACK_VALID');

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting || !callbackValid) return;
    diagnostic('RECOVERY_FORM_SUBMIT');
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('confirmation') || '');
    if (password.length < 6 || password.length > 128 || /[\u0000-\u001F\u007F]/.test(password)) {
      diagnostic('RECOVERY_PASSWORD_POLICY_INVALID', true);
      if (message) message.textContent = 'A senha deve ter entre 6 e 128 caracteres e não conter caracteres de controle.';
      return;
    }
    if (password !== confirmation) {
      diagnostic('RECOVERY_PASSWORD_MISMATCH', true);
      if (message) message.textContent = 'As senhas não coincidem.';
      return;
    }
    isSubmitting = true;
    if (button) button.disabled = true;
    diagnostic('RECOVERY_REQUEST_STARTED');
    try {
      const response = await fetch(credentials.isSupabase ? '/api/auth/reset-password/supabase' : '/api/auth/reset-password', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials.isSupabase
          ? { accessToken: credentials.accessToken, refreshToken: credentials.refreshToken, recoveryType: 'recovery', newPassword: password }
          : { token: credentials.token, newPassword: password }),
      });
      if (!response.ok) {
        diagnostic('RECOVERY_REQUEST_REJECTED', true);
        let publicCode: unknown;
        try {
          const body = await response.clone().json() as { code?: unknown };
          publicCode = body?.code;
        } catch { /* respostas sem JSON permanecem sanitizadas pelo status */ }
        if (message) message.textContent = recoveryErrorMessage(response.status, publicCode);
        isSubmitting = false; if (button) button.disabled = false; return;
      }
      let responseBody: { ok?: unknown; code?: unknown } | null = null;
      try {
        const parsed = await response.clone().json() as unknown;
        if (parsed && typeof parsed === 'object')
          responseBody = parsed as { ok?: unknown; code?: unknown };
      } catch {
        responseBody = null;
      }
      if (responseBody?.code === 'RECOVERY_PASSWORD_UPDATED_SESSION_REVOCATION_PENDING') {
        diagnostic('RECOVERY_SESSION_REVOCATION_PENDING', true);
        if (message)
          message.textContent = 'Senha atualizada, mas o encerramento das sessões ainda está pendente. Tente novamente mais tarde.';
        isSubmitting = true;
        if (button) button.disabled = true;
        return;
      }
      if (responseBody?.ok !== true) {
        diagnostic('RECOVERY_RESPONSE_INVALID', true);
        if (message)
          message.textContent = 'Não foi possível confirmar a redefinição. Tente novamente.';
        isSubmitting = false;
        if (button) button.disabled = false;
        return;
      }
      diagnostic('RECOVERY_REQUEST_SUCCEEDED');
      if (message) message.textContent = 'Senha redefinida. Você será redirecionado ao login.';
      window.setTimeout(() => { window.location.href = '/'; }, 1200);
    } catch {
      diagnostic('RECOVERY_NETWORK_FAILED', true);
      if (message) message.textContent = 'Serviço temporariamente indisponível. Tente novamente.';
      isSubmitting = false; if (button) button.disabled = false;
    }
  });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();
