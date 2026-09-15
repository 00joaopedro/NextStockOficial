"use strict";
const params = new URLSearchParams(window.location.search);
const token = params.get('token') || '';
const recoveryParams = new URLSearchParams(window.location.hash.slice(1));
const accessToken = recoveryParams.get('access_token') || '';
const refreshToken = recoveryParams.get('refresh_token') || '';
const isSupabaseRecovery = recoveryParams.get('type') === 'recovery';
const hasSupabaseRecovery = isSupabaseRecovery && Boolean(accessToken && refreshToken);
if (token || recoveryParams.toString())
    window.history.replaceState({}, document.title, window.location.pathname);
const form = document.querySelector('#reset-form');
const message = document.querySelector('#message');
const hasRecoveryProof = Boolean(token || hasSupabaseRecovery);
let isSubmitting = false;
const setSubmitting = (submitting) => {
    isSubmitting = submitting;
    form?.setAttribute('aria-busy', String(submitting));
    form?.querySelectorAll('input, button').forEach((field) => {
        if (field instanceof HTMLInputElement || field instanceof HTMLButtonElement)
            field.disabled = submitting || !hasRecoveryProof;
    });
};
if (!hasRecoveryProof) {
    form?.querySelectorAll('input, button').forEach((field) => {
        if (field instanceof HTMLInputElement || field instanceof HTMLButtonElement)
            field.disabled = true;
    });
    if (message)
        message.textContent =
            'Link de recuperação inválido ou expirado. Solicite um novo e-mail.';
}
form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (isSubmitting)
        return;
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirmation = String(data.get('confirmation') || '');
    if ((!token && !hasSupabaseRecovery) || password !== confirmation) {
        if (message)
            message.textContent = 'Não foi possível redefinir a senha.';
        return;
    }
    setSubmitting(true);
    const response = await fetch(hasSupabaseRecovery
        ? '/api/auth/reset-password/supabase'
        : '/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hasSupabaseRecovery
            ? { accessToken, refreshToken, recoveryType: 'recovery', newPassword: password }
            : { token, newPassword: password }),
    }).catch(() => null);
    if (!response) {
        if (message)
            message.textContent = 'Serviço temporariamente indisponível. Tente novamente.';
        setSubmitting(false);
        return;
    }
    if (message)
        message.textContent = response.ok
            ? 'Senha redefinida. Você será redirecionado ao login.'
            : 'Não foi possível redefinir a senha.';
    if (response.ok)
        window.setTimeout(() => {
            window.location.href = '/';
        }, 1200);
    else
        setSubmitting(false);
});
