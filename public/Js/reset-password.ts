const query = new URLSearchParams(window.location.search);
const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
const localToken = query.get('token');
const recoveryType = hash.get('type') || query.get('type');
const accessToken = hash.get('access_token');
const refreshToken = hash.get('refresh_token');
const isSupabaseRecovery = recoveryType === 'recovery' && !!accessToken && !!refreshToken;

if (localToken || accessToken || refreshToken || recoveryType) {
  window.history.replaceState({}, document.title, window.location.pathname);
}

const form = document.querySelector<HTMLFormElement>('#reset-form');
const message = document.querySelector<HTMLElement>('#message');
const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
let submitted = false;

function show(text: string, error = false) {
  if (message) {
    message.textContent = text;
    message.dataset.state = error ? 'error' : 'success';
  }
}

if (!localToken && !isSupabaseRecovery) {
  show('Este link de recuperação é inválido ou expirou.', true);
  if (form) form.hidden = true;
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitted) return;
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmation') || '');
  if (password !== confirmation) {
    show('As senhas não coincidem.', true);
    return;
  }
  submitted = true;
  if (submit) submit.disabled = true;
  show('Atualizando sua senha...');
  try {
    const endpoint = isSupabaseRecovery ? '/api/auth/supabase-password-recovery' : '/api/auth/reset-password';
    const body = isSupabaseRecovery
      ? { accessToken, refreshToken, recoveryType, newPassword: password }
      : { token: localToken, newPassword: password };
    const response = await fetch(endpoint, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('recovery_failed');
    show('Senha redefinida com sucesso. Redirecionando para o login...');
    window.setTimeout(() => { window.location.href = '/'; }, 1200);
  } catch {
    submitted = false;
    if (submit) submit.disabled = false;
    show('Este link de recuperação é inválido ou expirou.', true);
  }
});
