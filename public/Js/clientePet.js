(function () {
  const API_HEADERS = { Accept: 'application/json' };
  const PREVIEW_MESSAGE = 'Modo visualizacao: alteracao bloqueada.';

  const pesquisaCliente = document.getElementById('pesquisaCliente');
  const clientesList = document.getElementById('clientesList');
  const perfilClienteNome = document.getElementById('perfilClienteNome');
  const perfilClienteTelefone = document.getElementById('perfilClienteTelefone');
  const perfilClienteBairro = document.getElementById('perfilClienteBairro');
  const perfilClienteRua = document.getElementById('perfilClienteRua');
  const perfilClienteCep = document.getElementById('perfilClienteCep');
  const perfilClienteBloco = document.getElementById('perfilClienteBloco');
  const perfilClienteNumeroCasa = document.getElementById('perfilClienteNumeroCasa');
  const btnAtualizarPerfilCliente = document.getElementById('btnAtualizarPerfilCliente');
  const btnApagarPerfilCliente = document.getElementById('btnApagarPerfilCliente');
  const btnSalvarPerfilCliente = document.getElementById('btnSalvarPerfilCliente');
  const agendamentoList = document.getElementById('agendamentoList');
  const petsGrid = document.getElementById('petsGrid');
  const btnCriarCliente = document.getElementById('btnCriarCliente');
  const btnSalvarCliente = document.getElementById('btnSalvarCliente');
  const btnFecharClienteModal = document.getElementById('btnFecharClienteModal');
  const btnCriarAgendamento = document.getElementById('btnCriarAgendamento');
  const btnAtualizarAgendamento = document.getElementById('btnAtualizarAgendamento');
  const btnApagarAgendamento = document.getElementById('btnApagarAgendamento');
  const btnAdicionarAnimal = document.getElementById('btnAdicionarAnimal');
  const btnAtualizarAnimal = document.getElementById('btnAtualizarAnimal');
  const btnApagarAnimal = document.getElementById('btnApagarAnimal');
  const animalModal = document.getElementById('animalModal');
  const modalTitle = document.getElementById('modalTitle');
  const btnFecharModal = document.getElementById('btnFecharModal');
  const btnSalvarAnimal = document.getElementById('btnSalvarAnimal');
  const btnHabilitarEdicao = document.getElementById('btnHabilitarEdicao');
  const clienteModal = document.getElementById('clienteModal');
  const agendamentoModal = document.getElementById('agendamentoModal');
  const agendamentoModalTitle = document.getElementById('agendamentoModalTitle');
  const btnSalvarAgendamento = document.getElementById('btnSalvarAgendamento');
  const btnFecharAgendamentoModal = document.getElementById('btnFecharAgendamentoModal');
  const clienteNomeCompleto = document.getElementById('clienteNomeCompleto');
  const clienteTelefone = document.getElementById('clienteTelefone');
  const clienteBairro = document.getElementById('clienteBairro');
  const clienteRua = document.getElementById('clienteRua');
  const clienteCep = document.getElementById('clienteCep');
  const clienteBloco = document.getElementById('clienteBloco');
  const clienteNumeroCasa = document.getElementById('clienteNumeroCasa');
  const agDia = document.getElementById('agDia');
  const agMes = document.getElementById('agMes');
  const agAno = document.getElementById('agAno');
  const agHora = document.getElementById('agHora');
  const agPreco = document.getElementById('agPreco');
  const agAnimal = document.getElementById('agAnimal');
  const agDescricao = document.getElementById('agDescricao');
  const agDescricaoCounter = document.getElementById('agDescricaoCounter');
  const agAtendente = document.getElementById('agAtendente');
  const animalNome = document.getElementById('animalNome');
  const animalIdade = document.getElementById('animalIdade');
  const animalAltura = document.getElementById('animalAltura');
  const animalLargura = document.getElementById('animalLargura');
  const animalComprimento = document.getElementById('animalComprimento');
  const animalAlimento = document.getElementById('animalAlimento');
  const animalRaca = document.getElementById('animalRaca');
  const animalRemediosTomados = document.getElementById('animalRemediosTomados');
  const animalRemediosPendentes = document.getElementById('animalRemediosPendentes');
  const animalDescricao = document.getElementById('animalDescricao');
  const descricaoCounter = document.getElementById('descricaoCounter');
  const animalFotos = document.getElementById('animalFotos');
  const imageList = document.getElementById('imageList');
  const photoPreviewGrid = document.getElementById('photoPreviewGrid');
  const popupOverlay = document.getElementById('popupOverlay');
  const popupTitle = document.getElementById('popupTitle');
  const popupMessage = document.getElementById('popupMessage');
  const popupActions = document.getElementById('popupActions');

  let clientes = [];
  let selectedClientId = null;
  let selectedPetId = null;
  let selectedScheduleId = null;
  let editingPetId = null;
  let editingScheduleId = null;
  let modalMode = 'view';
  let agendamentoMode = 'create';
  let currentPhotos = [];
  let pendingPhotoFiles = [];
  let authContext = {
    profile: null,
    selectedBranch: null,
    systemType: null,
    systemMode: 'PREVIEW',
    isPreview: true,
    isReady: false,
  };

  function escapeHtml(text) {
    return String(text || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getStoredSelectedBranch() {
    try {
      return JSON.parse(sessionStorage.getItem('nextstockSelectedBranch') || 'null');
    } catch {
      return null;
    }
  }

  function normalizeSystemType(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeBranch(branch) {
    if (!branch?.id || !branch?.tenantId) {
      return null;
    }

    const systemType = normalizeSystemType(branch.tenant?.systemType || branch.systemType);

    if (!systemType) {
      return null;
    }

    return {
      id: branch.id,
      name: branch.name,
      tenantId: branch.tenantId,
      systemType,
    };
  }

  function getProfileBranches(profile, systemContext) {
    const user = profile.user || {};
    const branches = [
      profile.selectedBranch,
      systemContext?.selectedBranch,
      ...(Array.isArray(user.branches) ? user.branches : []),
    ];

    return branches.map(normalizeBranch).filter(Boolean);
  }

  function resolvePetShopBranch(profile, systemContext) {
    const storedBranch = normalizeBranch(getStoredSelectedBranch());
    const branches = getProfileBranches(profile, systemContext);

    if (storedBranch?.id) {
      const realStoredBranch = branches.find((branch) => branch.id === storedBranch.id);

      if (realStoredBranch?.systemType === 'petshop') {
        return realStoredBranch;
      }
    }

    return branches.find((branch) => branch.systemType === 'petshop') || null;
  }

  function persistContext(profile, selectedBranch, systemType) {
    sessionStorage.removeItem('nextstockPreviewMode');
    sessionStorage.removeItem('nextstockIsPreview');
    sessionStorage.setItem('nextstockBackendMode', 'production');
    sessionStorage.setItem('nextstockSystemType', systemType);
    sessionStorage.setItem('nextstockSelectedSystemType', systemType);

    if (selectedBranch) {
      sessionStorage.setItem('nextstockSelectedBranch', JSON.stringify(selectedBranch));
      sessionStorage.setItem('nextstockTenantId', selectedBranch.tenantId || '');
      sessionStorage.setItem('nextstockBranchId', selectedBranch.id || '');
    }

    if (profile?.user?.isSuperAdmin || profile?.user?.is_super_admin) {
      sessionStorage.setItem('nextstockIsSuperAdmin', 'true');
    }
    if (profile?.user?.isDevSuperAdmin) {
      sessionStorage.setItem('nextstockIsDevSuperAdmin', 'true');
    }
  }

  function branchHeader() {
    const branchId = authContext.selectedBranch?.id || sessionStorage.getItem('nextstockBranchId');
    return branchId ? { 'x-nextstock-branch-id': branchId } : {};
  }

  async function apiFetch(url, options = {}) {
    const headers = {
      ...API_HEADERS,
      ...branchHeader(),
      ...(options.headers || {}),
    };
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers,
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : null;

    if (!response.ok) {
      const message =
        data?.message ||
        data?.error ||
        (response.status === 401
          ? 'Sessao expirada ou invalida. Faca login novamente.'
          : 'Erro ao comunicar com o backend.');
      throw new Error(Array.isArray(message) ? message.join(', ') : message);
    }

    return data;
  }

  async function loadAuthContext() {
    clientesList.innerHTML = '<div class="list-empty">Validando sessao...</div>';
    const profile = await apiFetch('/api/auth/profile');
    const systemContext = await apiFetch('/api/system/context').catch(() => null);
    const user = profile.user || {};
    const selectedBranch = resolvePetShopBranch(profile, systemContext);
    const systemType =
      selectedBranch?.systemType ||
      user.systemType ||
      (systemContext?.tenantType === 'PETSHOP' ? 'petshop' : 'padrao');
    const isPreview =
      systemContext?.systemMode === 'PREVIEW' ||
      user.mode === 'visualizacao' ||
      sessionStorage.getItem('nextstockIsPreview') === 'true' ||
      sessionStorage.getItem('nextstockPreviewMode') === 'true';

    authContext = {
      profile,
      selectedBranch,
      systemType,
      systemMode: systemContext?.systemMode || (isPreview ? 'PREVIEW' : 'PRODUCTION'),
      isPreview,
      isReady: true,
    };

    persistContext(profile, selectedBranch, systemType);
    setWriteControls();

    if (systemType !== 'petshop') {
      blockPage('Esta pagina e exclusiva do modo Pet Shop.');
      return false;
    }

    if (!selectedBranch?.id || !selectedBranch?.tenantId || selectedBranch.systemType !== 'petshop') {
      blockPage('Selecione uma filial Pet Shop valida antes de abrir esta pagina.');
      return false;
    }

    return true;
  }

  function blockPage(message) {
    clientesList.innerHTML = `<div class="list-empty">${escapeHtml(message)}</div>`;
    clearClientProfile();
    agendamentoList.innerHTML = '<div class="list-empty">Indisponivel.</div>';
    petsGrid.innerHTML = '<div class="list-empty">Indisponivel.</div>';
    disableWriteButtons(true);
    showAlertPopup('Acesso bloqueado', message);
  }

  function disableWriteButtons(disabled) {
    [
      btnCriarCliente,
      btnSalvarPerfilCliente,
      btnAtualizarPerfilCliente,
      btnApagarPerfilCliente,
      btnCriarAgendamento,
      btnAtualizarAgendamento,
      btnApagarAgendamento,
      btnAdicionarAnimal,
      btnAtualizarAnimal,
      btnApagarAnimal,
      btnSalvarCliente,
      btnSalvarAgendamento,
      btnSalvarAnimal,
      btnHabilitarEdicao,
      animalFotos,
    ].forEach((element) => {
      if (element) element.disabled = disabled;
    });
  }

  function setWriteControls() {
    disableWriteButtons(!authContext.isReady || authContext.isPreview);
  }

  function ensureCanWrite() {
    if (!authContext.isReady) {
      showAlertPopup('Sessao invalida', 'Sessao expirada ou invalida. Faca login novamente.');
      return false;
    }

    if (authContext.systemType !== 'petshop') {
      showAlertPopup('Acesso bloqueado', 'Esta pagina e exclusiva do modo Pet Shop.');
      return false;
    }

    if (authContext.isPreview) {
      showAlertPopup('Modo visualizacao', PREVIEW_MESSAGE);
      return false;
    }

    if (!authContext.selectedBranch?.id || !authContext.selectedBranch?.tenantId) {
      showAlertPopup('Filial ausente', 'Selecione uma filial Pet Shop valida.');
      return false;
    }

    return true;
  }

  function getSelectedClient() {
    return clientes.find((cliente) => cliente.id === selectedClientId) || null;
  }

  async function loadClientes(search = pesquisaCliente.value) {
    clientesList.innerHTML = '<div class="list-empty">Carregando clientes...</div>';
    const params = new URLSearchParams({
      page: '1',
      pageSize: '100',
    });
    if (search?.trim()) params.set('search', search.trim());

    const response = await apiFetch(`/api/pet-clients?${params.toString()}`);
    clientes = (response.clients || []).map(normalizeClient);

    if (!clientes.some((cliente) => cliente.id === selectedClientId)) {
      selectedClientId = clientes[0]?.id || null;
    }

    renderClientes();
    await selectClient(selectedClientId, true);
  }

  function normalizeClient(client) {
    return {
      id: client.id,
      nomeCompleto: client.name || '',
      telefone: client.phone || '',
      email: client.email || '',
      documento: client.document || '',
      endereco: {
        bairro: client.address?.bairro || '',
        rua: client.address?.rua || '',
        cep: client.address?.cep || '',
        bloco: client.address?.bloco || '',
        numeroCasa: client.address?.numeroCasa || '',
      },
      agendamentos: [],
      animais: (client.pets || []).map(normalizePet),
    };
  }

  function normalizePet(pet) {
    return {
      id: pet.id,
      nome: pet.name || '',
      especie: pet.species || 'dog',
      idade: pet.ageText || '',
      nascimento: pet.birthDate || '',
      altura: pet.height || '',
      largura: pet.width || '',
      comprimento: pet.length || '',
      peso: pet.weight || '',
      alimentoDia: pet.foodPerDay || '',
      raca: pet.breed || '',
      remediosTomados: pet.vaccinesTaken || '',
      remediosPendentes: pet.vaccinesPending || '',
      descricao: pet.description || '',
      fotos: (pet.photos || []).map((photo) => ({
        id: photo.id,
        name: photo.fileName,
        src: photo.fileUrl || '',
        storagePath: photo.storagePath || '',
      })),
    };
  }

  function renderClientes() {
    clientesList.innerHTML = '';

    if (!clientes.length) {
      clientesList.innerHTML = '<div class="list-empty">Nenhum cliente encontrado.</div>';
      clearClientProfile();
      renderAgendamentos();
      renderPets();
      return;
    }

    clientes.forEach((cliente) => {
      const div = document.createElement('div');
      div.className = 'list-item' + (cliente.id === selectedClientId ? ' active' : '');
      div.innerHTML = `
        <div class="client-card-title">${escapeHtml(cliente.nomeCompleto)}</div>
        <div class="client-card-sub">Telefone: ${escapeHtml(cliente.telefone || 'Nao informado')}</div>
      `;
      div.addEventListener('click', () => selectClient(cliente.id));
      clientesList.appendChild(div);
    });
  }

  async function selectClient(clientId, shouldLoadAppointments = true) {
    selectedClientId = clientId || null;
    selectedPetId = null;
    selectedScheduleId = null;
    renderClientes();
    fillClientProfile();
    renderPets();
    fillAnimalSelect();
    if (shouldLoadAppointments) await loadAgendamentos();
  }

  function fillClientProfile() {
    const cliente = getSelectedClient();

    if (!cliente) {
      clearClientProfile();
      return;
    }

    perfilClienteNome.value = cliente.nomeCompleto || '';
    perfilClienteTelefone.value = cliente.telefone || '';
    perfilClienteBairro.value = cliente.endereco?.bairro || '';
    perfilClienteRua.value = cliente.endereco?.rua || '';
    perfilClienteCep.value = cliente.endereco?.cep || '';
    perfilClienteBloco.value = cliente.endereco?.bloco || '';
    perfilClienteNumeroCasa.value = cliente.endereco?.numeroCasa || '';
  }

  function clearClientProfile() {
    [
      perfilClienteNome,
      perfilClienteTelefone,
      perfilClienteBairro,
      perfilClienteRua,
      perfilClienteCep,
      perfilClienteBloco,
      perfilClienteNumeroCasa,
    ].forEach((field) => {
      field.value = '';
    });
  }

  function clientPayloadFromProfile() {
    return {
      name: perfilClienteNome.value.trim(),
      phone: perfilClienteTelefone.value.trim(),
      address: {
        bairro: perfilClienteBairro.value.trim(),
        rua: perfilClienteRua.value.trim(),
        cep: perfilClienteCep.value.trim(),
        bloco: perfilClienteBloco.value.trim(),
        numeroCasa: perfilClienteNumeroCasa.value.trim(),
      },
    };
  }

  function clientPayloadFromModal() {
    return {
      name: clienteNomeCompleto.value.trim(),
      phone: clienteTelefone.value.trim(),
      address: {
        bairro: clienteBairro.value.trim(),
        rua: clienteRua.value.trim(),
        cep: clienteCep.value.trim(),
        bloco: clienteBloco.value.trim(),
        numeroCasa: clienteNumeroCasa.value.trim(),
      },
    };
  }

  async function saveClientProfile() {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    if (!cliente) {
      showAlertPopup('Aviso', 'Selecione um cliente.');
      return;
    }
    const payload = clientPayloadFromProfile();
    if (!payload.name || !payload.phone) {
      showAlertPopup('Aviso', 'Preencha nome completo e telefone.');
      return;
    }
    await apiFetch(`/api/pet-clients/${cliente.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await loadClientes();
    showAlertPopup('Sucesso', 'Perfil do cliente salvo com sucesso.');
  }

  function updateClientProfile() {
    if (!ensureCanWrite()) return;
    showConfirmPopup('Atualizar cliente', 'Deseja atualizar os dados deste cliente?', saveClientProfile);
  }

  function deleteClientProfile() {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    if (!cliente) {
      showAlertPopup('Aviso', 'Selecione um cliente.');
      return;
    }
    showConfirmPopup('Apagar perfil', `Deseja realmente apagar o perfil de "${cliente.nomeCompleto}"?`, async () => {
      await apiFetch(`/api/pet-clients/${cliente.id}`, { method: 'DELETE' });
      selectedClientId = null;
      await loadClientes();
      showAlertPopup('Sucesso', 'Perfil do cliente apagado com sucesso.');
    });
  }

  function openClienteModal() {
    if (!ensureCanWrite()) return;
    resetClienteForm();
    clienteModal.classList.add('active');
  }

  function closeClienteModal() {
    clienteModal.classList.remove('active');
    resetClienteForm();
  }

  function resetClienteForm() {
    [
      clienteNomeCompleto,
      clienteTelefone,
      clienteBairro,
      clienteRua,
      clienteCep,
      clienteBloco,
      clienteNumeroCasa,
    ].forEach((field) => {
      field.value = '';
    });
  }

  async function saveCliente() {
    if (!ensureCanWrite()) return;
    const payload = clientPayloadFromModal();
    if (!payload.name || !payload.phone) {
      showAlertPopup('Aviso', 'Preencha nome completo e numero de telefone.');
      return;
    }
    const response = await apiFetch('/api/pet-clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    selectedClientId = response.client.id;
    closeClienteModal();
    await loadClientes();
    showAlertPopup('Sucesso', 'Cliente criado com sucesso.');
  }

  async function loadAgendamentos() {
    const cliente = getSelectedClient();
    agendamentoList.innerHTML = '<div class="list-empty">Carregando agendamentos...</div>';
    if (!cliente) {
      renderAgendamentos();
      return;
    }
    const response = await apiFetch(`/api/pet-clients/${cliente.id}/appointments`);
    cliente.agendamentos = (response.appointments || []).map(normalizeAppointment);
    renderAgendamentos();
  }

  function normalizeAppointment(item) {
    const date = item.data ? new Date(item.data) : null;
    const pet = item.petId || item.pet_id || null;
    return {
      id: item.id,
      dia: date ? String(date.getUTCDate()).padStart(2, '0') : '',
      mes: date ? String(date.getUTCMonth() + 1).padStart(2, '0') : '',
      ano: date ? String(date.getUTCFullYear()) : '',
      hora: item.hora || '',
      preco: String(item.preco ?? ''),
      animalId: pet,
      descricao: item.descricao || '',
      atendente: item.atendente || '',
      servico: item.servico || item.descricao || 'Atendimento Pet',
    };
  }

  function renderAgendamentos() {
    agendamentoList.innerHTML = '';
    const cliente = getSelectedClient();

    if (!cliente || !cliente.agendamentos.length) {
      agendamentoList.innerHTML = '<div class="list-empty">Este cliente nao possui agendamentos.</div>';
      return;
    }

    cliente.agendamentos.forEach((item) => {
      const animal = cliente.animais.find((pet) => pet.id === item.animalId);
      const div = document.createElement('div');
      div.className = 'list-item' + (item.id === selectedScheduleId ? ' active' : '');
      div.innerHTML = `
        <div class="schedule-title">${escapeHtml(item.dia)}/${escapeHtml(item.mes)}/${escapeHtml(item.ano)} - ${escapeHtml(item.hora)}</div>
        <div class="schedule-sub">
          <strong>Preco:</strong> R$ ${escapeHtml(item.preco)}<br>
          <strong>Animal:</strong> ${escapeHtml(animal ? animal.nome : 'Nao encontrado')}<br>
          <strong>Atendente:</strong> ${escapeHtml(item.atendente)}<br>
          <strong>Descricao:</strong> ${escapeHtml(item.descricao)}
        </div>
      `;
      div.addEventListener('click', () => {
        selectedScheduleId = item.id;
        renderAgendamentos();
      });
      agendamentoList.appendChild(div);
    });
  }

  function renderPets() {
    petsGrid.innerHTML = '';
    const cliente = getSelectedClient();

    if (!cliente || !cliente.animais.length) {
      petsGrid.innerHTML = '<div class="list-empty">Nenhum animal cadastrado para este cliente.</div>';
      return;
    }

    cliente.animais.forEach((animal) => {
      const card = document.createElement('div');
      card.className = 'pet-card' + (animal.id === selectedPetId ? ' active' : '');
      const imageUrl = animal.fotos.length ? animal.fotos[0].src : null;
      card.innerHTML = `
        <div class="pet-card-image">
          ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="Foto de ${escapeHtml(animal.nome || 'animal')}">` : '<span>Sem foto</span>'}
        </div>
        <div class="pet-card-body">
          <div class="pet-card-name">${escapeHtml(animal.nome || 'Sem nome')}</div>
          <div class="pet-card-breed">${escapeHtml(animal.raca || 'Raca nao informada')}</div>
          <div class="pet-card-hint">Clique para ver o perfil</div>
        </div>
      `;
      card.addEventListener('click', () => {
        selectedPetId = animal.id;
        renderPets();
        openAnimalModal('view', animal.id);
      });
      petsGrid.appendChild(card);
    });
  }

  function fillAnimalSelect() {
    const cliente = getSelectedClient();
    agAnimal.innerHTML = '<option value="">Selecione o animal</option>';
    if (!cliente) return;
    cliente.animais.forEach((animal) => {
      const option = document.createElement('option');
      option.value = animal.id;
      option.textContent = animal.nome || 'Sem nome';
      agAnimal.appendChild(option);
    });
  }

  function openAgendamentoModal(mode) {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    if (!cliente) {
      showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
      return;
    }
    fillAnimalSelect();
    resetAgendamentoForm();
    agendamentoMode = mode;
    agendamentoModalTitle.textContent = mode === 'create' ? 'Criar Agendamento' : 'Atualizar Agendamento';
    if (mode === 'edit') {
      const agendamento = cliente.agendamentos.find((item) => item.id === selectedScheduleId);
      if (!agendamento) {
        showAlertPopup('Aviso', 'Selecione um agendamento para atualizar.');
        return;
      }
      editingScheduleId = agendamento.id;
      agDia.value = agendamento.dia;
      agMes.value = agendamento.mes;
      agAno.value = agendamento.ano;
      agHora.value = agendamento.hora;
      agPreco.value = agendamento.preco;
      agAnimal.value = agendamento.animalId || '';
      agDescricao.value = agendamento.descricao;
      agAtendente.value = agendamento.atendente;
      updateAgDescricaoCounter();
    }
    agendamentoModal.classList.add('active');
  }

  function closeAgendamentoModal() {
    agendamentoModal.classList.remove('active');
    resetAgendamentoForm();
    editingScheduleId = null;
    agendamentoMode = 'create';
  }

  function resetAgendamentoForm() {
    [agDia, agMes, agAno, agHora, agPreco, agAnimal, agDescricao, agAtendente].forEach((field) => {
      field.value = '';
    });
    updateAgDescricaoCounter();
  }

  async function saveAgendamento() {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    if (!cliente) return;
    const dia = agDia.value.trim().padStart(2, '0');
    const mes = agMes.value.trim().padStart(2, '0');
    const ano = agAno.value.trim();
    const payload = {
      cliente: cliente.nomeCompleto,
      animal: agAnimal.options[agAnimal.selectedIndex]?.textContent || '',
      atendente: agAtendente.value.trim(),
      servico: agDescricao.value.trim() || 'Atendimento Pet',
      data: `${ano}-${mes}-${dia}`,
      hora: agHora.value.trim(),
      preco: Number(agPreco.value),
      descricao: agDescricao.value.trim(),
      clientId: cliente.id,
      petId: agAnimal.value || undefined,
    };

    if (!payload.data || !payload.hora || !payload.preco || !payload.petId || !payload.descricao || !payload.atendente) {
      showAlertPopup('Aviso', 'Preencha todos os campos do agendamento.');
      return;
    }

    const url = agendamentoMode === 'create'
      ? '/api/agenda-pet'
      : `/api/agenda-pet/${editingScheduleId}`;
    const method = agendamentoMode === 'create' ? 'POST' : 'PATCH';
    await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeAgendamentoModal();
    await loadAgendamentos();
    showAlertPopup('Sucesso', agendamentoMode === 'create' ? 'Agendamento criado com sucesso.' : 'Agendamento atualizado com sucesso.');
  }

  async function deleteSelectedAgendamento() {
    if (!ensureCanWrite()) return;
    if (!selectedScheduleId) {
      showAlertPopup('Aviso', 'Selecione um agendamento para apagar.');
      return;
    }
    showConfirmPopup('Confirmar exclusao', 'Deseja realmente apagar este agendamento?', async () => {
      await apiFetch(`/api/agenda-pet/${selectedScheduleId}`, { method: 'DELETE' });
      selectedScheduleId = null;
      await loadAgendamentos();
      showAlertPopup('Sucesso', 'Agendamento apagado com sucesso.');
    });
  }

  function openAnimalModal(mode, petId = null) {
    const cliente = getSelectedClient();
    if (!cliente) {
      showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
      return;
    }
    if (mode !== 'view' && !ensureCanWrite()) return;
    modalMode = mode;
    editingPetId = petId;
    resetAnimalForm();
    if (mode === 'create') {
      modalTitle.textContent = 'Cadastrar Perfil do Animal';
      setFormEditable(true);
      btnHabilitarEdicao.style.display = 'none';
    } else {
      const pet = cliente.animais.find((item) => item.id === petId);
      if (!pet) return;
      fillAnimalForm(pet);
      const readOnly = mode === 'view';
      setFormEditable(!readOnly);
      btnHabilitarEdicao.style.display = authContext.isPreview ? 'none' : 'inline-block';
      modalTitle.textContent = readOnly ? 'Perfil do Animal' : 'Atualizar Perfil do Animal';
    }
    animalModal.classList.add('active');
  }

  function closeAnimalModal() {
    animalModal.classList.remove('active');
    resetAnimalForm();
    editingPetId = null;
    modalMode = 'view';
  }

  function setFormEditable(canEdit) {
    [
      animalNome,
      animalIdade,
      animalAltura,
      animalLargura,
      animalComprimento,
      animalAlimento,
      animalRaca,
      animalRemediosTomados,
      animalRemediosPendentes,
      animalDescricao,
      animalFotos,
    ].forEach((field) => {
      field.disabled = !canEdit || authContext.isPreview;
    });
    btnSalvarAnimal.style.display = canEdit && !authContext.isPreview ? 'inline-block' : 'none';
  }

  function fillAnimalForm(pet) {
    animalNome.value = pet.nome || '';
    animalIdade.value = pet.idade || '';
    animalAltura.value = pet.altura || '';
    animalLargura.value = pet.largura || '';
    animalComprimento.value = pet.comprimento || '';
    animalAlimento.value = pet.alimentoDia || '';
    animalRaca.value = pet.raca || '';
    animalRemediosTomados.value = pet.remediosTomados || '';
    animalRemediosPendentes.value = pet.remediosPendentes || '';
    animalDescricao.value = pet.descricao || '';
    currentPhotos = pet.fotos ? [...pet.fotos] : [];
    pendingPhotoFiles = [];
    updateDescricaoCounter();
    renderPhotoManager();
  }

  function resetAnimalForm() {
    [
      animalNome,
      animalIdade,
      animalAltura,
      animalLargura,
      animalComprimento,
      animalAlimento,
      animalRaca,
      animalRemediosTomados,
      animalRemediosPendentes,
      animalDescricao,
    ].forEach((field) => {
      field.value = '';
    });
    animalFotos.value = '';
    currentPhotos = [];
    pendingPhotoFiles = [];
    imageList.innerHTML = '';
    photoPreviewGrid.innerHTML = '';
    updateDescricaoCounter();
  }

  function getAnimalFormData() {
    return {
      name: animalNome.value.trim(),
      ageText: animalIdade.value.trim(),
      height: animalAltura.value.trim(),
      width: animalLargura.value.trim(),
      length: animalComprimento.value.trim(),
      foodPerDay: animalAlimento.value.trim(),
      breed: animalRaca.value.trim(),
      vaccinesTaken: animalRemediosTomados.value.trim(),
      vaccinesPending: animalRemediosPendentes.value.trim(),
      description: animalDescricao.value.trim(),
      species: 'dog',
    };
  }

  async function saveAnimal() {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    if (!cliente) return;
    const data = getAnimalFormData();
    if (!data.name) {
      showAlertPopup('Aviso', 'Preencha o nome do animal.');
      return;
    }
    const url = modalMode === 'create'
      ? `/api/pet-clients/${cliente.id}/pets`
      : `/api/pets/${editingPetId}`;
    const method = modalMode === 'create' ? 'POST' : 'PATCH';
    const response = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const petId = response.pet.id;
    await uploadPendingPhotos(petId);
    selectedPetId = petId;
    closeAnimalModal();
    await loadClientes();
    fillAnimalSelect();
    showAlertPopup('Sucesso', modalMode === 'create' ? 'Animal cadastrado com sucesso.' : 'Dados do animal atualizados com sucesso.');
  }

  async function uploadPendingPhotos(petId) {
    for (const file of pendingPhotoFiles) {
      const formData = new FormData();
      formData.append('file', file);
      await apiFetch(`/api/pets/${petId}/photos`, {
        method: 'POST',
        body: formData,
        headers: branchHeader(),
      });
    }
  }

  function deleteSelectedPet() {
    if (!ensureCanWrite()) return;
    const cliente = getSelectedClient();
    const pet = cliente?.animais.find((item) => item.id === selectedPetId);
    if (!pet) {
      showAlertPopup('Aviso', 'Selecione um animal para apagar.');
      return;
    }
    showConfirmPopup('Confirmar exclusao', `Deseja realmente apagar o animal "${pet.nome || 'Sem nome'}"?`, async () => {
      await apiFetch(`/api/pets/${pet.id}`, { method: 'DELETE' });
      selectedPetId = null;
      await loadClientes();
      await loadAgendamentos();
      showAlertPopup('Sucesso', 'Animal apagado com sucesso.');
    });
  }

  function updateSelectedPet() {
    if (!selectedPetId) {
      showAlertPopup('Aviso', 'Selecione um animal para atualizar.');
      return;
    }
    openAnimalModal('edit', selectedPetId);
  }

  function renderPhotoManager() {
    imageList.innerHTML = '';
    photoPreviewGrid.innerHTML = '';
    const allPhotos = [
      ...currentPhotos,
      ...pendingPhotoFiles.map((file, index) => ({
        name: file.name,
        src: URL.createObjectURL(file),
        pendingIndex: index,
      })),
    ];
    if (!allPhotos.length) return;
    allPhotos.forEach((photo, index) => {
      const item = document.createElement('div');
      item.className = 'image-item';
      item.innerHTML = `
        <span class="image-name">${escapeHtml(photo.name)}</span>
        ${!animalFotos.disabled ? `<button type="button" class="remove-image-btn" data-index="${index}">x</button>` : ''}
      `;
      imageList.appendChild(item);
      const preview = document.createElement('div');
      preview.className = 'photo-preview-item';
      preview.innerHTML = `
        ${photo.src ? `<img src="${escapeHtml(photo.src)}" alt="Foto ${index + 1}">` : ''}
        <div>${escapeHtml(photo.name)}</div>
      `;
      photoPreviewGrid.appendChild(preview);
    });
    imageList.querySelectorAll('.remove-image-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const index = Number(btn.dataset.index);
        const photo = allPhotos[index];
        if (photo?.id && editingPetId) {
          await apiFetch(`/api/pets/${editingPetId}/photos/${photo.id}`, { method: 'DELETE' });
          currentPhotos = currentPhotos.filter((item) => item.id !== photo.id);
        } else if (photo?.pendingIndex !== undefined) {
          pendingPhotoFiles.splice(photo.pendingIndex, 1);
        }
        renderPhotoManager();
      });
    });
  }

  function handlePhotoUpload(files) {
    if (!ensureCanWrite()) return;
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    if (currentPhotos.length + pendingPhotoFiles.length + selectedFiles.length > 3) {
      showAlertPopup('Limite excedido', 'E permitido adicionar no maximo 3 fotos por animal.');
      animalFotos.value = '';
      return;
    }
    const invalid = selectedFiles.find((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    if (invalid) {
      showAlertPopup('Formato invalido', 'Use imagens JPEG, PNG ou WEBP.');
      animalFotos.value = '';
      return;
    }
    pendingPhotoFiles.push(...selectedFiles);
    animalFotos.value = '';
    renderPhotoManager();
  }

  function updateDescricaoCounter() {
    descricaoCounter.textContent = `${animalDescricao.value.length} / 300`;
  }

  function updateAgDescricaoCounter() {
    agDescricaoCounter.textContent = `${agDescricao.value.length} / 500`;
  }

  function showAlertPopup(title, message) {
    popupTitle.textContent = title;
    popupMessage.textContent = message;
    popupActions.innerHTML = '<button type="button" class="btn btn-save" id="popupOkBtn">OK</button>';
    popupOverlay.classList.add('active');
    document.getElementById('popupOkBtn').addEventListener('click', closePopup);
  }

  function showConfirmPopup(title, message, onConfirm) {
    popupTitle.textContent = title;
    popupMessage.textContent = message;
    popupActions.innerHTML = `
      <button type="button" class="btn btn-delete" id="popupConfirmBtn">Confirmar</button>
      <button type="button" class="btn btn-cancel" id="popupCancelBtn">Cancelar</button>
    `;
    popupOverlay.classList.add('active');
    document.getElementById('popupConfirmBtn').addEventListener('click', async () => {
      closePopup();
      try {
        await onConfirm();
      } catch (error) {
        showAlertPopup('Erro', error.message || 'Nao foi possivel concluir a acao.');
      }
    });
    document.getElementById('popupCancelBtn').addEventListener('click', closePopup);
  }

  function closePopup() {
    popupOverlay.classList.remove('active');
    popupActions.innerHTML = '';
  }

  function bindEvents() {
    let searchTimer;
    pesquisaCliente.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        loadClientes(pesquisaCliente.value).catch((error) => showAlertPopup('Erro', error.message));
      }, 300);
    });
    btnCriarCliente.addEventListener('click', openClienteModal);
    btnFecharClienteModal.addEventListener('click', closeClienteModal);
    btnSalvarCliente.addEventListener('click', () => showConfirmPopup('Salvar cliente', 'Deseja salvar este cliente?', saveCliente));
    btnSalvarPerfilCliente.addEventListener('click', () => showConfirmPopup('Salvar perfil', 'Deseja salvar o perfil deste cliente?', saveClientProfile));
    btnAtualizarPerfilCliente.addEventListener('click', updateClientProfile);
    btnApagarPerfilCliente.addEventListener('click', deleteClientProfile);
    btnCriarAgendamento.addEventListener('click', () => openAgendamentoModal('create'));
    btnAtualizarAgendamento.addEventListener('click', () => openAgendamentoModal('edit'));
    btnApagarAgendamento.addEventListener('click', deleteSelectedAgendamento);
    btnFecharAgendamentoModal.addEventListener('click', closeAgendamentoModal);
    btnSalvarAgendamento.addEventListener('click', () => showConfirmPopup('Salvar agendamento', 'Deseja salvar este agendamento?', saveAgendamento));
    btnAdicionarAnimal.addEventListener('click', () => openAnimalModal('create'));
    btnAtualizarAnimal.addEventListener('click', updateSelectedPet);
    btnApagarAnimal.addEventListener('click', deleteSelectedPet);
    btnFecharModal.addEventListener('click', closeAnimalModal);
    btnSalvarAnimal.addEventListener('click', () => showConfirmPopup('Salvar alteracoes', 'Deseja salvar os dados do animal?', saveAnimal));
    btnHabilitarEdicao.addEventListener('click', () => {
      if (!ensureCanWrite() || !editingPetId) return;
      modalMode = 'edit';
      modalTitle.textContent = 'Atualizar Perfil do Animal';
      setFormEditable(true);
      showAlertPopup('Edicao liberada', 'Agora voce pode atualizar os dados do animal e salvar as alteracoes.');
    });
    animalFotos.addEventListener('change', (event) => {
      if (animalFotos.disabled) return;
      handlePhotoUpload(event.target.files);
    });
    animalDescricao.addEventListener('input', updateDescricaoCounter);
    agDescricao.addEventListener('input', updateAgDescricaoCounter);
    animalModal.addEventListener('click', (event) => {
      if (event.target === animalModal) closeAnimalModal();
    });
    clienteModal.addEventListener('click', (event) => {
      if (event.target === clienteModal) closeClienteModal();
    });
    agendamentoModal.addEventListener('click', (event) => {
      if (event.target === agendamentoModal) closeAgendamentoModal();
    });
    popupOverlay.addEventListener('click', (event) => {
      if (event.target === popupOverlay) closePopup();
    });
  }

  async function init() {
    bindEvents();
    disableWriteButtons(true);
    updateDescricaoCounter();
    updateAgDescricaoCounter();
    try {
      const canLoad = await loadAuthContext();
      if (canLoad) {
        await loadClientes();
        setWriteControls();
      }
    } catch (error) {
      blockPage(error.message || 'Sessao expirada ou invalida. Faca login novamente.');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    void init();
  }
})();
