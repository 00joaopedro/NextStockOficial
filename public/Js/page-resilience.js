(function () {
  function readUrlState(keys) {
    const params = new URLSearchParams(window.location.search);
    return keys.reduce((state, key) => {
      state[key] = params.get(key) || '';
      return state;
    }, {});
  }

  function writeUrlState(values) {
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    });
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function renderRetry(container, message, onRetry) {
    container.textContent = '';
    const text = document.createElement('div');
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Tentar novamente';
    button.className = 'secondary-btn';
    button.addEventListener('click', () => void onRetry());
    container.append(text, button);
  }

  function createDirtyGuard(root) {
    let cleanSnapshot = snapshot();

    function snapshot() {
      return Array.from(root.querySelectorAll('input, select, textarea'))
        .map((field) => `${field.name || field.id}:${field.type === 'checkbox' ? field.checked : field.value}`)
        .join('|');
    }

    function isDirty() {
      return snapshot() !== cleanSnapshot;
    }

    function markClean() {
      cleanSnapshot = snapshot();
    }

    window.addEventListener('beforeunload', (event) => {
      if (!isDirty()) return;
      event.preventDefault();
      event.returnValue = '';
    });

    return {
      isDirty,
      markClean,
      confirmDiscard() {
        return !isDirty() || window.confirm('Existem alteracoes nao salvas. Deseja descartar?');
      },
    };
  }

  window.NextStockPageResilience = {
    readUrlState,
    writeUrlState,
    renderRetry,
    createDirtyGuard,
  };
})();
