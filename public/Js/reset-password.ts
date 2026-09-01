const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
if (token) window.history.replaceState({}, document.title, '/reset-password');

const form = document.querySelector<HTMLFormElement>('#reset-form');
const message = document.querySelector<HTMLElement>('#message');
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('confirmation') || '');
  if (!token || password !== confirmation) {
    if (message) message.textContent = 'Não foi possível redefinir a senha.';
    return;
  }
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, newPassword: password }),
  });
  if (message) message.textContent = response.ok
    ? 'Senha redefinida. Você será redirecionado ao login.'
    : 'Não foi possível redefinir a senha.';
  if (response.ok) window.setTimeout(() => { window.location.href = '/'; }, 1200);
});
