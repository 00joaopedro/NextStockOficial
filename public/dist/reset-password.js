const diagnostic = (code, error = false) => (error ? console.error : console.info)(code);
export const recoveryErrorMessage = (status, publicCode) => {
    const code = typeof publicCode === 'string' ? publicCode : '';
    if (code === 'RECOVERY_REQUEST_INVALID')
        return 'A solicitação é inválida. Verifique os dados e tente novamente.';
    if (code === 'RECOVERY_LINK_INVALID')
        return 'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
    if (code === 'PASSWORD_POLICY_REJECTED')
        return 'A senha não atende às regras exigidas.';
    if (code === 'RECOVERY_PROVIDER_UNAVAILABLE')
        return 'Serviço temporariamente indisponível. Tente novamente.';
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
    const credentials = {
        token: query.get('token') || '',
        accessToken: fragment.get('access_token') || '',
        refreshToken: fragment.get('refresh_token') || '',
        isSupabase: fragment.get('type') === 'recovery',
    };
    if (credentials.token || fragment.toString())
        window.history.replaceState({}, document.title, window.location.pathname);
    const form = document.querySelector('#reset-form');
    const message = document.querySelector('#message');
    const button = form?.querySelector('button[type="submit"]');
    const callbackValid = Boolean(credentials.token ||
        (credentials.isSupabase && credentials.accessToken && credentials.refreshToken));
    let isSubmitting = false;
    diagnostic('RECOVERY_PAGE_READY');
    if (!callbackValid) {
        diagnostic(fragment.toString() ? 'RECOVERY_TYPE_INVALID' : 'RECOVERY_CALLBACK_MISSING', true);
        if (message)
            message.textContent = 'Este link de recuperação é inválido ou expirou. Solicite um novo e-mail.';
        if (button)
            button.disabled = true;
    }
    else
        diagnostic('RECOVERY_CALLBACK_VALID');
    form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (isSubmitting || !callbackValid)
            return;
        diagnostic('RECOVERY_FORM_SUBMIT');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const data = new FormData(form);
        const password = String(data.get('password') || '');
        const confirmation = String(data.get('confirmation') || '');
        if (password.length < 6 || password.length > 128 || /[\u0000-\u001F\u007F]/.test(password)) {
            diagnostic('RECOVERY_PASSWORD_POLICY_INVALID', true);
            if (message)
                message.textContent = 'A senha deve ter entre 6 e 128 caracteres e não conter caracteres de controle.';
            return;
        }
        if (password !== confirmation) {
            diagnostic('RECOVERY_PASSWORD_MISMATCH', true);
            if (message)
                message.textContent = 'As senhas não coincidem.';
            return;
        }
        isSubmitting = true;
        if (button)
            button.disabled = true;
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
                let publicCode;
                try {
                    const body = await response.clone().json();
                    publicCode = body?.code;
                }
                catch { }
                if (message)
                    message.textContent = recoveryErrorMessage(response.status, publicCode);
                isSubmitting = false;
                if (button)
                    button.disabled = false;
                return;
            }
            diagnostic('RECOVERY_REQUEST_SUCCEEDED');
            if (message)
                message.textContent = 'Senha redefinida. Você será redirecionado ao login.';
            window.setTimeout(() => { window.location.href = '/'; }, 1200);
        }
        catch {
            diagnostic('RECOVERY_NETWORK_FAILED', true);
            if (message)
                message.textContent = 'Serviço temporariamente indisponível. Tente novamente.';
            isSubmitting = false;
            if (button)
                button.disabled = false;
        }
    });
};
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
else
    start();
