(function () {
  'use strict';

  const state = {
    profile: null,
    context: null,
    draft: null,
    document: null,
    saleId: null,
    orderId: null,
    idempotencyKey: null,
    busy: false,
  };

  const elements = {
    status: document.getElementById('fiscalStatus'),
    items: document.getElementById('itemsList'),
    send: document.getElementById('btnEnviar'),
    consult: document.getElementById('btnConsultar'),
    xml: document.getElementById('btnXml'),
    pdf: document.getElementById('btnPdf'),
    addItem: document.getElementById('btnAddItem'),
    newDocument: document.getElementById('btnNovo'),
    searchClient: document.getElementById('searchClient'),
    autocomplete: document.getElementById('autocompleteList'),
  };

  function selectedBranch() {
    try {
      return JSON.parse(
        sessionStorage.getItem('nextstockSelectedBranch') || 'null',
      );
    } catch {
      return null;
    }
  }

  function headers(hasBody) {
    const result = {};
    if (hasBody) result['Content-Type'] = 'application/json';
    const branch = selectedBranch();
    if (branch?.id) result['x-nextstock-branch-id'] = branch.id;
    try {
      const support = JSON.parse(
        sessionStorage.getItem('nextstockDevSupportContext') || 'null',
      );
      if (support?.branchId && support.branchId === branch?.id) {
        result['x-nextstock-dev-context'] = 'support';
      }
    } catch {
      // The backend remains the authority for support context.
    }
    return result;
  }

  async function api(path, options) {
    const response = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: {
        ...headers(Boolean(options?.body)),
        ...(options?.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      window.location.href = './index.html';
      throw new Error('Sessao expirada.');
    }
    if (!response.ok) {
      const message = Array.isArray(data.message)
        ? data.message.join(' ')
        : data.message;
      const error = new Error(message || 'Falha na operacao fiscal.');
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function setStatus(message, tone) {
    elements.status.textContent = message;
    elements.status.style.background =
      tone === 'error'
        ? '#fdecec'
        : tone === 'success'
          ? '#e8f7ed'
          : tone === 'warning'
            ? '#fff4df'
            : '#eaf8f8';
    elements.status.style.color =
      tone === 'error'
        ? '#a92222'
        : tone === 'success'
          ? '#1e6d38'
          : tone === 'warning'
            ? '#805200'
            : '#0d6d6d';
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.send.disabled = busy || !state.saleId;
    elements.consult.disabled = busy || !state.document;
    elements.xml.disabled = busy || !state.document?.hasXml;
    elements.pdf.disabled = busy || !state.document?.hasPdf;
    elements.newDocument.disabled = busy;
  }

  function value(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function setValue(id, nextValue) {
    const field = document.getElementById(id);
    if (field) field.value = nextValue ?? '';
  }

  function cents(valueToFormat) {
    return Number(valueToFormat || 0) / 100;
  }

  function formatMoney(valueToFormat) {
    return Number(valueToFormat || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  }

  function createField(labelText, className, fieldValue) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field span-2';
    const label = document.createElement('label');
    label.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = className;
    input.value = fieldValue ?? '';
    input.readOnly = true;
    wrapper.append(label, input);
    return wrapper;
  }

  function renderItems(items) {
    elements.items.replaceChildren();
    items.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'item-card';
      const top = document.createElement('div');
      top.className = 'item-top';
      const title = document.createElement('h4');
      title.textContent = `Item ${index + 1}`;
      const origin = document.createElement('span');
      origin.className = 'hint';
      origin.textContent = 'Snapshot fiscal controlado pelo backend';
      top.append(title, origin);

      const fields = document.createElement('div');
      fields.className = 'fields';
      fields.append(
        createField('Produto', 'item-descricao', item.description),
        createField('SKU', 'item-codigo', item.sku || item.barcode),
        createField('NCM', 'item-ncm', item.ncm),
        createField('CFOP', 'item-cfop', item.cfop),
        createField('Unidade', 'item-unidade', item.unit),
        createField('Origem', 'item-origem', item.origin),
        createField('Quantidade', 'item-quantidade', item.quantity),
        createField(
          'Valor unitario',
          'item-unitario',
          cents(item.unitPriceCents).toFixed(2),
        ),
        createField(
          'Total',
          'item-total',
          cents(item.totalPriceCents).toFixed(2),
        ),
        createField('ICMS (%)', 'item-icms', item.icmsRate),
        createField('IPI (%)', 'item-ipi', item.ipiRate),
        createField('PIS (%)', 'item-pis', item.pisRate),
        createField('COFINS (%)', 'item-cofins', item.cofinsRate),
      );
      card.append(top, fields);
      elements.items.appendChild(card);
    });
  }

  function fillCompany(company) {
    if (!company) return;
    setValue('emitRazao', company.legalName);
    setValue('emitFantasia', company.tradeName);
    setValue('emitCnpj', company.cnpj);
    setValue('emitIe', company.stateRegistration);
    setValue('emitCrt', String(company.crt || 1));
    setValue(
      'emitEndereco',
      [company.street, company.number, company.complement]
        .filter(Boolean)
        .join(', '),
    );
    setValue('emitBairro', company.district);
    setValue('emitMunicipio', company.city);
    setValue('emitUf', company.state);
    setValue('emitCep', company.zipCode);
    setValue('ambiente', company.environment);
    if (company.nfeSeries) setValue('serieNota', company.nfeSeries);
  }

  function fillRecipient(recipient) {
    if (!recipient) return;
    setValue('destNome', recipient.name);
    setValue('destTipoDoc', recipient.documentType || documentType(recipient.document));
    setValue('destDoc', recipient.document);
    setValue('destIe', recipient.stateRegistration);
    setValue('destIndIe', recipient.ieIndicator || '9');
    setValue('destEmail', recipient.email);
    setValue('destTelefone', recipient.phone);
    setValue('destEndereco', recipient.street);
    setValue('destNumero', recipient.number);
    setValue('destBairro', recipient.district);
    setValue('destMunicipio', recipient.city);
    setValue('destCityCodeIbge', recipient.cityCodeIbge);
    setValue('destUf', recipient.state);
    setValue('destCep', recipient.zipCode);
    setValue('destPais', recipient.country || 'Brasil');
  }

  function fillTotals(totals) {
    const subtotal = Number(totals?.subtotalCents ?? totals?.productsCents ?? 0);
    const discount = Number(totals?.discountCents || 0);
    const freight = Number(totals?.freightCents || 0);
    const total = Number(
      totals?.totalCents ?? subtotal - discount + freight,
    );
    document.getElementById('totalProdutos').textContent = formatMoney(
      cents(subtotal),
    );
    document.getElementById('totalDesconto').textContent = formatMoney(
      cents(discount),
    );
    document.getElementById('totalFrete').textContent = formatMoney(
      cents(freight),
    );
    document.getElementById('valorNota').textContent = formatMoney(cents(total));
    setValue('frete', cents(freight).toFixed(2));
    setValue('valorPago', cents(total).toFixed(2));
  }

  function applyDraft(draft) {
    state.draft = draft;
    state.saleId = draft.saleId || null;
    state.orderId = draft.orderId || null;
    fillCompany(draft.company);
    fillRecipient(draft.recipient);
    renderItems(draft.items || []);
    fillTotals(draft.totals);
    elements.send.disabled = !state.saleId;
    if (!draft.company) {
      setStatus(
        'Configuracao fiscal da filial ausente. Um Admin deve configurar o emitente pela API fiscal.',
        'error',
      );
    } else if (!draft.eligibleForEmission) {
      setStatus(draft.eligibilityMessage || 'Venda ainda nao elegivel.', 'warning');
    } else {
      setStatus('Rascunho real carregado. A emissao depende de validacao fiscal.', 'success');
    }
  }

  function applyDocument(documentData) {
    state.document = documentData;
    state.saleId = documentData.saleId;
    state.orderId = documentData.orderId;
    setValue('numeroNota', documentData.number);
    setValue('serieNota', documentData.series);
    setValue('ambiente', documentData.environment);
    setValue('dataEmissao', toLocalDateTime(documentData.issuedAt || documentData.createdAt));
    fillCompany(documentData.payload?.issuer);
    fillRecipient(documentData.payload?.recipient);
    renderItems(documentData.payload?.items || documentData.items || []);
    fillTotals(documentData.payload?.totals);
    setStatus(statusLabel(documentData.status, documentData.errorMessage), statusTone(documentData.status));
    setBusy(false);
  }

  function statusLabel(status, errorMessage) {
    const labels = {
      draft: 'Rascunho salvo',
      processing: 'Processamento fiscal pendente',
      authorized: 'Autorizado pela SEFAZ',
      rejected: 'Documento rejeitado',
      canceled: 'Documento cancelado',
    };
    return errorMessage
      ? `${labels[status] || status}: ${errorMessage}`
      : labels[status] || status || 'Rascunho';
  }

  function statusTone(status) {
    if (status === 'authorized') return 'success';
    if (status === 'rejected' || status === 'canceled') return 'error';
    if (status === 'processing') return 'warning';
    return 'info';
  }

  function documentType(documentValue) {
    const digits = String(documentValue || '').replace(/\D/g, '');
    return digits.length === 14 ? 'cnpj' : 'cpf';
  }

  function toLocalDateTime(dateValue) {
    const date = dateValue ? new Date(dateValue) : new Date();
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function recipientPayload() {
    return {
      name: value('destNome'),
      documentType: value('destTipoDoc'),
      document: value('destDoc'),
      stateRegistration: value('destIe') || undefined,
      ieIndicator: value('destIndIe') || '9',
      email: value('destEmail') || undefined,
      phone: value('destTelefone') || undefined,
      street: value('destEndereco'),
      number: value('destNumero'),
      district: value('destBairro'),
      city: value('destMunicipio'),
      cityCodeIbge: value('destCityCodeIbge'),
      state: value('destUf').toUpperCase(),
      zipCode: value('destCep'),
      country: value('destPais') || 'Brasil',
    };
  }

  function createPayload() {
    if (!state.saleId) {
      throw new Error('A emissao exige uma venda paga. Abra a pagina com saleId.');
    }
    state.idempotencyKey ||= window.crypto?.randomUUID?.() || fallbackUuid();
    return {
      saleId: state.saleId,
      idempotencyKey: state.idempotencyKey,
      recipient: recipientPayload(),
      operationNature: value('naturezaOperacao') || 'Venda de mercadoria',
      buyerPresence: value('indPres') || '0',
      finalConsumer: value('indFinal') || '1',
      freightCents: Math.round(Number(value('frete') || 0) * 100),
      additionalInformation: value('infoAdicionais') || undefined,
    };
  }

  async function ensureDocument() {
    if (state.document) return state.document;
    const data = await api('/api/fiscal/documents', {
      method: 'POST',
      body: JSON.stringify(createPayload()),
    });
    state.document = data.document;
    applyDocument(data.document);
    return data.document;
  }

  async function send() {
    if (state.busy) return;
    setBusy(true);
    setStatus('Validando e salvando documento fiscal...', 'warning');
    try {
      const fiscalDocument = await ensureDocument();
      const result = await api(
        `/api/fiscal/documents/${encodeURIComponent(fiscalDocument.id)}/send`,
        {
          method: 'POST',
          body: JSON.stringify({
            requestId: window.crypto?.randomUUID?.() || fallbackUuid(),
          }),
        },
      );
      applyDocument(result.document);
      setStatus(result.message || statusLabel(result.document.status), result.authorized ? 'success' : 'warning');
    } catch (error) {
      setStatus(error.message || 'Falha no processamento fiscal.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function consult() {
    if (!state.document || state.busy) return;
    setBusy(true);
    setStatus('Consultando status fiscal...', 'warning');
    try {
      const result = await api(
        `/api/fiscal/documents/${encodeURIComponent(state.document.id)}/status`,
        { method: 'POST', body: JSON.stringify({}) },
      );
      applyDocument(result.document);
      if (result.message) setStatus(result.message, 'warning');
    } catch (error) {
      setStatus(error.message || 'Falha ao consultar status.', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function download(format) {
    if (!state.document || state.busy) return;
    setBusy(true);
    try {
      const result = await api(
        `/api/fiscal/documents/${encodeURIComponent(state.document.id)}/${format}`,
      );
      window.open(result.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setStatus(error.message || `Nao foi possivel baixar ${format}.`, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadInitialSource() {
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get('documentId');
    const saleId = params.get('saleId');
    const orderId = params.get('orderId');
    if (documentId) {
      const result = await api(
        `/api/fiscal/documents/${encodeURIComponent(documentId)}`,
      );
      applyDocument(result.document);
      return;
    }
    if (saleId || orderId) {
      const query = saleId
        ? `saleId=${encodeURIComponent(saleId)}`
        : `orderId=${encodeURIComponent(orderId)}`;
      applyDraft(await api(`/api/fiscal/nfe55/draft?${query}`));
      return;
    }
    renderItems([]);
    setStatus(
      'Informe orderId, saleId ou documentId na URL. Emissao real exige uma Sale paga.',
      'warning',
    );
  }

  async function init() {
    elements.addItem.disabled = true;
    elements.addItem.title =
      'Itens fiscais sao carregados da venda e validados pelo backend.';
    elements.searchClient.disabled = true;
    elements.searchClient.placeholder =
      'Cadastro geral de clientes ainda nao disponivel; preencha o destinatario manualmente.';
    elements.autocomplete.replaceChildren();
    setValue('dataEmissao', toLocalDateTime());
    setBusy(true);
    try {
      const [profile, context] = await Promise.all([
        api('/api/auth/profile'),
        api('/api/system/context'),
      ]);
      state.profile = profile;
      state.context = context;
      await loadInitialSource();
    } catch (error) {
      setStatus(error.message || 'Nao foi possivel validar o contexto fiscal.', 'error');
    } finally {
      setBusy(false);
    }
  }

  function fallbackUuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = Math.floor(Math.random() * 16);
      const valueToUse = char === 'x' ? random : (random & 0x3) | 0x8;
      return valueToUse.toString(16);
    });
  }

  elements.send.addEventListener('click', send);
  elements.consult.addEventListener('click', consult);
  elements.xml.addEventListener('click', () => download('xml'));
  elements.pdf.addEventListener('click', () => download('pdf'));
  elements.newDocument.addEventListener('click', () => window.location.reload());

  init();
})();
