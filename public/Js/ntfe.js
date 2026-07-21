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
    certificateBusy: false,
    fiscalConfig: null,
    preview: false,
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
    environmentSummary: document.getElementById('fiscalEnvironmentSummary'),
    certificateSummary: document.getElementById('certificateStatusSummary'),
    certificateExpiry: document.getElementById('certificateExpirySummary'),
    certificateCnpj: document.getElementById('certificateCnpjSummary'),
    certificateFileSummary: document.getElementById('certificateFileSummary'),
    certificateMetadata: document.getElementById('certificateMetadataSummary'),
    certificateActionStatus: document.getElementById('certificateActionStatus'),
    certificateFile: document.getElementById('certificateFile'),
    certificatePassword: document.getElementById('certificatePassword'),
    certificateUpload: document.getElementById('btnCertificateUpload'),
    certificateValidate: document.getElementById('btnCertificateValidate'),
    certificateRemove: document.getElementById('btnCertificateRemove'),
    activateProduction: document.getElementById('btnActivateProduction'),
    adminPanel: document.getElementById('fiscalAdminPanel'),
    fiscalConfigSave: document.getElementById('btnFiscalConfigSave'),
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
    const isFormData =
      typeof FormData !== 'undefined' && options?.body instanceof FormData;
    const response = await fetch(path, {
      credentials: 'include',
      ...options,
      headers: {
        ...headers(Boolean(options?.body) && !isFormData),
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
    elements.send.disabled = state.preview || busy || !state.saleId;
    elements.consult.disabled = state.preview || busy || !state.document;
    elements.xml.disabled = busy || !state.document?.hasXml;
    elements.pdf.disabled = busy || !state.document?.hasPdf;
    elements.newDocument.disabled = state.preview || busy;
  }

  function setCertificateBusy(busy) {
    state.certificateBusy = busy;
    const certificate = state.fiscalConfig?.certificate;
    elements.certificateUpload.disabled = state.preview || busy;
    elements.certificateValidate.disabled =
      state.preview || busy || !certificate?.present;
    elements.certificateRemove.disabled =
      state.preview || busy || !certificate?.present;
    elements.activateProduction.disabled =
      state.preview || busy || state.fiscalConfig?.environment === 'producao';
    elements.fiscalConfigSave.disabled = state.preview || busy;
  }

  function value(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  function setValue(id, nextValue) {
    const field = document.getElementById(id);
    if (!field) return;
    if ('value' in field) field.value = nextValue ?? '';
    else field.textContent = nextValue ?? '';
  }

  function isAdmin() {
    const user = state.profile?.user || state.profile;
    return (
      user?.role === 'Admin' ||
      user?.role === 'admin' ||
      user?.roles?.includes('Admin') ||
      user?.roles?.includes('admin')
    );
  }

  function formatDate(valueToFormat) {
    if (!valueToFormat) return '—';
    const date = new Date(valueToFormat);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
  }

  function formatFileSize(size) {
    if (!Number.isFinite(Number(size))) return 'tamanho indisponível';
    return `${(Number(size) / 1024).toFixed(1)} KB`;
  }

  function certificateLabel(status) {
    return (
      {
        absent: 'Certificado ausente',
        pending: 'Validação pendente',
        valid: 'Certificado válido',
        invalid: 'Certificado inválido',
        expired: 'Certificado expirado',
        cnpj_mismatch: 'CNPJ divergente',
        decrypt_error: 'Erro ao desbloquear certificado',
      }[status] || 'Situação desconhecida'
    );
  }

  function renderEnvironment(environment) {
    const production = environment === 'producao';
    const label = production ? 'PRODUÇÃO (tpAmb=1)' : 'HOMOLOGAÇÃO (tpAmb=2)';
    elements.environmentSummary.textContent = label;
    const badge = document.getElementById('ambiente');
    badge.textContent = production ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';
    badge.classList.toggle('production', production);
  }

  function renderFiscalConfig(config) {
    state.fiscalConfig = config;
    renderEnvironment(config?.environment || 'homologacao');
    const certificate = config?.certificate || {
      present: false,
      status: 'absent',
    };
    elements.certificateSummary.textContent = certificateLabel(
      certificate.status,
    );
    elements.certificateExpiry.textContent = formatDate(certificate.expiresAt);
    elements.certificateCnpj.textContent = certificate.cnpj || '—';
    elements.certificateFileSummary.textContent =
      certificate.originalName || 'Nenhum certificado configurado';
    elements.certificateMetadata.textContent = certificate.present
      ? [
          formatFileSize(certificate.size),
          `enviado em ${formatDate(certificate.uploadedAt)}`,
          certificate.subject ? `titular: ${certificate.subject}` : '',
          certificate.issuer ? `emissor: ${certificate.issuer}` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : 'O certificado nunca é disponibilizado para download.';
    elements.adminPanel.hidden = !isAdmin();
    const configFields = {
      configLegalName: config?.legalName,
      configTradeName: config?.tradeName,
      configCnpj: config?.cnpj,
      configStateRegistration: config?.stateRegistration,
      configMunicipalRegistration: config?.municipalRegistration,
      configCrt: config?.crt || 1,
      configTaxRegime: config?.taxRegime,
      configStreet: config?.street,
      configNumber: config?.number,
      configComplement: config?.complement,
      configDistrict: config?.district,
      configCity: config?.city,
      configCityCode: config?.cityCodeIbge,
      configState: config?.state,
      configZipCode: config?.zipCode,
      configCountry: config?.country || 'Brasil',
      configNfeSeries: config?.nfeSeries || '1',
      configNfceSeries: config?.nfceSeries || '1',
    };
    Object.entries(configFields).forEach(([id, fieldValue]) =>
      setValue(id, fieldValue),
    );
    setCertificateBusy(false);
  }

  async function loadFiscalConfig() {
    const result = await api('/api/fiscal/config');
    renderFiscalConfig(result.config);
    return result.config;
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
    renderEnvironment(company.environment || 'homologacao');
    if (company.nfeSeries) setValue('serieNota', company.nfeSeries);
  }

  function fillRecipient(recipient) {
    if (!recipient) return;
    setValue('destNome', recipient.name);
    setValue(
      'destTipoDoc',
      recipient.documentType || documentType(recipient.document),
    );
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
    const subtotal = Number(
      totals?.subtotalCents ?? totals?.productsCents ?? 0,
    );
    const discount = Number(totals?.discountCents || 0);
    const freight = Number(totals?.freightCents || 0);
    const total = Number(totals?.totalCents ?? subtotal - discount + freight);
    document.getElementById('totalProdutos').textContent = formatMoney(
      cents(subtotal),
    );
    document.getElementById('totalDesconto').textContent = formatMoney(
      cents(discount),
    );
    document.getElementById('totalFrete').textContent = formatMoney(
      cents(freight),
    );
    document.getElementById('valorNota').textContent = formatMoney(
      cents(total),
    );
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
      setStatus(
        draft.eligibilityMessage || 'Venda ainda nao elegivel.',
        'warning',
      );
    } else {
      setStatus(
        'Rascunho real carregado. A emissao depende de validacao fiscal.',
        'success',
      );
    }
  }

  function applyDocument(documentData) {
    state.document = documentData;
    state.saleId = documentData.saleId;
    state.orderId = documentData.orderId;
    setValue('numeroNota', documentData.number);
    setValue('serieNota', documentData.series);
    renderEnvironment(documentData.environment || 'homologacao');
    setValue(
      'dataEmissao',
      toLocalDateTime(documentData.issuedAt || documentData.createdAt),
    );
    fillCompany(documentData.payload?.issuer);
    fillRecipient(documentData.payload?.recipient);
    renderItems(documentData.payload?.items || documentData.items || []);
    fillTotals(documentData.payload?.totals);
    setStatus(
      statusLabel(documentData.status, documentData.errorMessage),
      statusTone(documentData.status),
    );
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
      throw new Error(
        'A emissao exige uma venda paga. Abra a pagina com saleId.',
      );
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
      setStatus(
        result.message || statusLabel(result.document.status),
        result.authorized ? 'success' : 'warning',
      );
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

  function setCertificateMessage(message, tone) {
    elements.certificateActionStatus.textContent = message;
    elements.certificateActionStatus.style.color =
      tone === 'error' ? '#a92222' : tone === 'success' ? '#1e6d38' : '#805200';
  }

  async function saveFiscalConfig() {
    if (state.certificateBusy) return;
    const payload = {
      legalName: value('configLegalName'),
      tradeName: value('configTradeName') || undefined,
      cnpj: value('configCnpj'),
      stateRegistration: value('configStateRegistration') || undefined,
      municipalRegistration: value('configMunicipalRegistration') || undefined,
      crt: Number(value('configCrt')),
      taxRegime: value('configTaxRegime'),
      street: value('configStreet'),
      number: value('configNumber'),
      complement: value('configComplement') || undefined,
      district: value('configDistrict'),
      city: value('configCity'),
      cityCodeIbge: value('configCityCode'),
      state: value('configState').toUpperCase(),
      zipCode: value('configZipCode'),
      country: value('configCountry') || 'Brasil',
      nfeSeries: value('configNfeSeries'),
      nfceSeries: value('configNfceSeries'),
      provider: state.fiscalConfig?.provider || 'mock',
    };
    setCertificateBusy(true);
    setCertificateMessage('Salvando configuração fiscal...', 'warning');
    try {
      await api('/api/fiscal/config', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      await loadFiscalConfig();
      setCertificateMessage('Configuração fiscal salva.', 'success');
    } catch (error) {
      setCertificateMessage(
        error.message || 'Não foi possível salvar a configuração.',
        'error',
      );
    } finally {
      setCertificateBusy(false);
    }
  }

  async function uploadCertificate() {
    if (state.certificateBusy) return;
    const file = elements.certificateFile.files?.[0];
    if (!file) {
      setCertificateMessage('Selecione um arquivo .pfx ou .p12.', 'error');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', elements.certificatePassword.value);
    setCertificateBusy(true);
    setCertificateMessage('Enviando e validando o certificado...', 'warning');
    try {
      await api('/api/fiscal/certificate/upload', {
        method: 'POST',
        body: formData,
      });
      await loadFiscalConfig();
      elements.certificateFile.value = '';
      setCertificateMessage(
        'Certificado validado e armazenado com segurança.',
        'success',
      );
    } catch (error) {
      setCertificateMessage(
        error.message || 'Falha ao enviar o certificado.',
        'error',
      );
    } finally {
      elements.certificatePassword.value = '';
      setCertificateBusy(false);
    }
  }

  async function validateCertificate() {
    if (state.certificateBusy) return;
    setCertificateBusy(true);
    setCertificateMessage('Revalidando o certificado armazenado...', 'warning');
    try {
      await api('/api/fiscal/certificate/validate', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadFiscalConfig();
      setCertificateMessage('Certificado revalidado com sucesso.', 'success');
    } catch (error) {
      await loadFiscalConfig().catch(() => undefined);
      setCertificateMessage(
        error.message || 'Falha ao validar o certificado.',
        'error',
      );
    } finally {
      elements.certificatePassword.value = '';
      setCertificateBusy(false);
    }
  }

  async function removeCertificate() {
    if (
      state.certificateBusy ||
      !window.confirm(
        'Remover o certificado desta filial? O ambiente voltará para homologação.',
      )
    ) {
      return;
    }
    setCertificateBusy(true);
    setCertificateMessage('Removendo o certificado...', 'warning');
    try {
      await api('/api/fiscal/certificate', { method: 'DELETE' });
      await loadFiscalConfig();
      setCertificateMessage('Certificado removido.', 'success');
    } catch (error) {
      setCertificateMessage(
        error.message || 'Falha ao remover o certificado.',
        'error',
      );
    } finally {
      elements.certificatePassword.value = '';
      setCertificateBusy(false);
    }
  }

  async function activateProduction() {
    if (state.certificateBusy) return;
    const confirmation = window.prompt(
      'Produção emite documentos com validade fiscal. Digite ATIVAR PRODUÇÃO para confirmar:',
      '',
    );
    if (confirmation === null) return;
    setCertificateBusy(true);
    setCertificateMessage('Validando requisitos de produção...', 'warning');
    try {
      await api('/api/fiscal/environment/production/activate', {
        method: 'POST',
        body: JSON.stringify({ confirmation }),
      });
      await loadFiscalConfig();
      setCertificateMessage(
        'Ambiente de produção ativado para esta filial.',
        'success',
      );
    } catch (error) {
      setCertificateMessage(
        error.message || 'Produção não foi ativada.',
        'error',
      );
    } finally {
      setCertificateBusy(false);
    }
  }

  async function init() {
    if (window.isNextStockDemoMode?.()) {
      state.preview = true;
      setStatus("Modo visualizacao: emissao e configuracoes fiscais bloqueadas.", "info");
      return;
    }
    elements.addItem.disabled = true;
    elements.addItem.title =
      'Itens fiscais sao carregados da venda e validados pelo backend.';
    elements.searchClient.disabled = true;
    elements.searchClient.placeholder =
      'Cadastro geral de clientes ainda nao disponivel; preencha o destinatario manualmente.';
    elements.autocomplete.replaceChildren();
    [
      'emitRazao',
      'emitFantasia',
      'emitCnpj',
      'emitIe',
      'emitCrt',
      'emitEndereco',
      'emitBairro',
      'emitMunicipio',
      'emitUf',
      'emitCep',
      'emitTelefone',
    ].forEach((id) => {
      const field = document.getElementById(id);
      if (!field) return;
      field.readOnly = true;
      if (field.tagName === 'SELECT') field.disabled = true;
    });
    setValue('dataEmissao', toLocalDateTime());
    setBusy(true);
    try {
      const [profile, context] = await Promise.all([
        api('/api/auth/profile'),
        api('/api/system/context'),
      ]);
      state.profile = profile;
      state.context = context;
      state.preview = String(context.systemMode).toUpperCase() === 'PREVIEW';
      window.setNextStockBackendContext?.(context);
      await loadFiscalConfig();
      await loadInitialSource();
    } catch (error) {
      setStatus(
        error.message || 'Nao foi possivel validar o contexto fiscal.',
        'error',
      );
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
  elements.newDocument.addEventListener('click', () =>
    window.location.reload(),
  );
  elements.certificateUpload.addEventListener('click', uploadCertificate);
  elements.certificateValidate.addEventListener('click', validateCertificate);
  elements.certificateRemove.addEventListener('click', removeCertificate);
  elements.activateProduction.addEventListener('click', activateProduction);
  elements.fiscalConfigSave.addEventListener('click', saveFiscalConfig);

  init();
})();
