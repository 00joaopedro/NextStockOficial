(() => {
  const byId = (id) => document.getElementById(id);
  const file = byId('importFile'), sheet = byId('importSheet'), mapping = byId('importMapping');
  const button = byId('importBtn'), status = byId('importStatus'), progress = byId('importProgress');
  const fields = {
    name: 'Nome (obrigatório)', barcode: 'Código de barras', cost: 'Custo (obrigatório)',
    sale: 'Preço de venda', profit: 'Lucro em reais', percent: 'Acréscimo sobre custo (%)',
    quantity: 'Quantidade inteira (padrão: zero)',
  };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  let databaseFile, databaseType, firebirdEnabled = false, workbook, rows = [], selects = {}, items = [], branch, busy = false, attempt = null;
  const say = (msg) => { status.textContent = msg; };
  const addLine = (target, text) => {
    const li = document.createElement('li');
    li.textContent = text;
    target.append(li);
  };
  function review() {
    attempt = null;
    const preview = byId('importPreview'), issues = byId('importIssues');
    preview.replaceChildren();
    issues.replaceChildren();
    items = [];
    byId('importReview').hidden = false;
    button.disabled = true;
    if (!selects.name.value || !selects.cost.value || !['sale', 'profit', 'percent'].some((k) => selects[k].value)) {
      say('Escolha nome, custo e pelo menos um campo de preço ou lucro. O preço informado tem prioridade sobre o lucro em reais e a porcentagem.');
      return;
    }
    let invalid = 0;
    const seen = new Set();
    rows.slice(1).forEach((row, index) => {
      if (!row.some((cell) => String(cell ?? '').trim())) return;
      try {
        const raw = Object.fromEntries(Object.entries(selects).map(([key, input]) => [key, input.value ? row[Number(input.value) - 1] : undefined]));
        const item = window.NextStockProductImport.convert(raw);
        if (item.barcode && seen.has(item.barcode)) throw new Error('Código de barras repetido no arquivo.');
        if (item.barcode) seen.add(item.barcode);
        items.push(item);
        if (preview.children.length < 5) addLine(preview, `${item.name} · ${item.barcode || 'Sem código'} · ${money.format(item.salePriceCents / 100)} · Estoque: ${item.quantity}`);
      } catch (err) {
        invalid++;
        if (issues.children.length < 10) addLine(issues, `Linha ${index + 2}: ${err.message}`);
      }
    });
    say(`${items.length} produtos prontos; ${invalid} linhas serão ignoradas. Códigos já cadastrados também serão ignorados.`);
    button.disabled = !items.length;
  }
  async function readDatabase(table) {
    const body = new FormData();
    body.append('file', databaseFile);
    const query = table === undefined ? '' : '?' + new URLSearchParams({ table });
    const response = await fetch('/api/products/import/' + databaseType + query, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'x-nextstock-branch-id': branch.id }, body,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || 'Não foi possível ler o banco.');
    return result;
  }
  async function loadSheet() {
    attempt = null;
    button.disabled = true;
    mapping.hidden = true;
    byId('importReview').hidden = true;
    if (databaseFile) {
      say('Lendo a tabela…');
      const result = await readDatabase(sheet.value);
      rows = [result.headers, ...result.rows];
    } else {
      const source = workbook.Sheets[sheet.value];
      const range = window.XLSX.utils.decode_range(source['!fullref'] || source['!ref'] || 'A1');
      if (range.e.r >= 10001 || range.e.c >= 100) throw new Error('A planilha excede 10.000 linhas de produtos ou 100 colunas.');
      rows = window.XLSX.utils.sheet_to_json(source, { header: 1, raw: false, defval: '', blankrows: true });
    }
    if (rows.length < 2) throw new Error('O arquivo precisa de títulos e pelo menos um produto.');
    selects = {};
    mapping.replaceChildren();
    for (const [key, caption] of Object.entries(fields)) {
      const label = document.createElement('label');
      const input = document.createElement('select');
      input.add(new Option('Não usar', ''));
      rows[0].forEach((heading, i) => input.add(new Option(String(heading || `Coluna ${i + 1}`), String(i + 1))));
      label.textContent = caption + ' ';
      label.append(input);
      mapping.append(label);
      input.addEventListener('change', review);
      selects[key] = input;
    }
    mapping.hidden = false;
    review();
  }
  file.addEventListener('change', async () => {
    button.disabled = true;
    mapping.hidden = true;
    byId('importReview').hidden = true;
    byId('importSheetField').hidden = true;
    attempt = null;
    const selected = file.files[0];
    if (!selected) return;
    file.disabled = sheet.disabled = true;
    try {
      databaseFile = null;
      databaseType = null;
      workbook = null;
      if (selected.size > 5 * 1024 * 1024) throw new Error('Selecione um arquivo de até 5 MB.');
      if (/\.(sqlite|sqlite3|db|fdb)$/i.test(selected.name)) {
        databaseType = /\.fdb$/i.test(selected.name) ? 'firebird' : 'sqlite';
        if (databaseType === 'firebird' && !firebirdEnabled) {
          throw new Error('Leitura direta indisponível. Exporte os produtos do Firebird para CSV.');
        }
        databaseFile = selected;
        say('Identificando tabelas…');
        const { tables } = await readDatabase();
        if (!tables.length) throw new Error('Nenhuma tabela de dados foi encontrada.');
        sheet.replaceChildren(new Option('Escolha a tabela de produtos', ''), ...tables.map((name) => new Option(name, name)));
        byId('importSheetLabel').textContent = databaseType === 'firebird' ? 'Tabela Firebird' : 'Tabela SQLite';
        byId('importSheetField').hidden = false;
        say('Escolha a tabela que contém seus produtos.');
      } else {
        if (!/\.(csv|xls|xlsx)$/i.test(selected.name)) throw new Error('Selecione um CSV, Excel ou SQLite.');
        if (!window.XLSX) throw new Error('O leitor de planilhas não carregou. Atualize a página e tente novamente.');
        workbook = window.XLSX.read(await selected.arrayBuffer(), { raw: true, sheetRows: 10002 });
        sheet.replaceChildren(...workbook.SheetNames.map((name) => new Option(name, name)));
        byId('importSheetLabel').textContent = 'Planilha';
        byId('importSheetField').hidden = workbook.SheetNames.length < 2;
        await loadSheet();
      }
    } catch (err) { say(err.message); }
    finally { file.disabled = sheet.disabled = false; }
  });
  sheet.addEventListener('change', async () => {
    if (!sheet.value) {
      button.disabled = true;
      mapping.hidden = byId('importReview').hidden = true;
      say('Escolha a tabela que contém seus produtos.');
      return;
    }
    file.disabled = sheet.disabled = true;
    try { await loadSheet(); }
    catch (err) { say(err.message); }
    finally { file.disabled = sheet.disabled = false; }
  });
  const unload = (event) => { event.preventDefault(); event.returnValue = ''; };
  button.addEventListener('click', async () => {
    if (busy || !items.length || !branch) return;
    busy = true;
    button.disabled = file.disabled = sheet.disabled = true;
    for (const input of Object.values(selects)) input.disabled = true;
    progress.hidden = false;
    progress.max = items.length;
    window.addEventListener('beforeunload', unload);
    try {
      if (!attempt) {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(items)));
        attempt = { hash: Array.from(new Uint8Array(digest), (v) => v.toString(16).padStart(2, '0')).join(''), sent: 0, imported: 0, duplicates: 0 };
      }
      while (attempt.sent < items.length) {
        progress.value = attempt.sent;
        say(`Processando ${attempt.sent} de ${items.length} produtos…`);
        const response = await fetch('/api/products/import', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json', 'x-nextstock-branch-id': branch.id, 'idempotency-key': `product-import:${attempt.hash}:${attempt.sent}` },
          body: JSON.stringify({ items: items.slice(attempt.sent, attempt.sent + 200) }),
        });
        const body = await response.json();
        if (!response.ok || !body.result) throw new Error([body.message].flat().filter(Boolean).join(' · ') || 'Não foi possível salvar o lote.');
        const { received, imported, duplicates } = body.result;
        if (received !== Math.min(200, items.length - attempt.sent) ||
            !Number.isInteger(imported) || imported < 0 ||
            !Number.isInteger(duplicates) || duplicates < 0 ||
            imported + duplicates !== received) throw new Error('Resposta inválida do lote.');
        attempt.sent += received;
        attempt.imported += imported;
        attempt.duplicates += duplicates;
      }
      progress.value = attempt.sent;
      say(`Concluído: ${attempt.imported} importados; ${attempt.duplicates} duplicados. Consulte a página Produtos.`);
    } catch (err) {
      say(`Importação interrompida após ${attempt?.sent || 0} produtos processados. ${err.message} Clique novamente para retomar sem duplicar o lote.`);
      button.disabled = false;
    } finally {
      busy = false;
      file.disabled = sheet.disabled = false;
      for (const input of Object.values(selects)) input.disabled = false;
      window.removeEventListener('beforeunload', unload);
    }
  });
  async function start() {
    if (window.isNextStockDemoMode?.()) throw new Error('A importação não está disponível na demonstração.');
    let selected;
    try { selected = JSON.parse(sessionStorage.getItem('nextstockSelectedBranch') || 'null')?.id; } catch {}
    selected ||= sessionStorage.getItem('nextstockBranchId');
    const response = await fetch('/api/system/context', { headers: selected ? { 'x-nextstock-branch-id': selected } : {} });
    if (!response.ok) throw new Error('Entre como administrador para importar produtos.');
    const context = await response.json();
    branch = context.selectedBranch;
    if (!branch?.id || context.role !== 'Admin' || context.systemMode === 'PREVIEW') throw new Error('A importação exige uma filial ativa e acesso de administrador.');
    byId('importDestination').textContent = `Destino: ${branch.name || 'filial ativa'}`;
    const capability = await fetch('/api/products/import/capabilities', {
      headers: { 'x-nextstock-branch-id': branch.id },
    }).then((res) => res.ok ? res.json() : null).catch(() => null);
    if (capability?.firebird === true) {
      firebirdEnabled = true;
      file.accept += ',.fdb';
      byId('firebirdImportHint').textContent = 'Selecione uma cópia .fdb compatível com Firebird 3 de até 5 MB. Se a versão for mais antiga, exporte CSV no sistema de origem ou peça ao suporte para converter uma cópia.';
    }
    file.disabled = false;
  }
  start().catch((err) => say(err.message));
})();
