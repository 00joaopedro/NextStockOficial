(() => {
  const GATE_TIMEOUT_MS = 20_000;
  const timer = window.setTimeout(() => {
    const body = document.body;
    const gate = document.getElementById('accessGate');
    if (!body || body.dataset.locked !== 'true' || !gate) return;

    gate.innerHTML =
      '<h2>Validação demorou mais que o esperado</h2>' +
      '<p>Não foi possível concluir a validação agora. Seus dados continuam protegidos.</p>' +
      '<button type="button" id="partnersGateRetry">Tentar novamente</button>';
    document.getElementById('partnersGateRetry')?.addEventListener('click', () => {
      window.location.reload();
    });
  }, GATE_TIMEOUT_MS);

  window.addEventListener('nextstock:partners-ready', () => {
    window.clearTimeout(timer);
  }, { once: true });
})();