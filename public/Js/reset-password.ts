type Credentials = { token: string; accessToken: string; refreshToken: string; isSupabase: boolean };

const diagnostic = (code: string, error = false) => (error ? console.error : console.info)(code);

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
        if (message) message.textContent = response.status === 422 ? 'A senha não atende às regras exigidas.' : 'Não foi possível redefinir a senha. Solicite um novo link e tente novamente.';
        isSubmitting = false; if (button) button.disabled = false; return;
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
