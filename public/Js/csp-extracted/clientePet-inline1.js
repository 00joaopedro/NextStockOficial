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

    const clientes = [
      {
        id: 1,
        nomeCompleto: 'Mariana Oliveira Santos',
        telefone: '(91) 99999-0001',
        endereco: {
          bairro: 'Umarizal',
          rua: 'Rua das Flores',
          cep: '66000-100',
          bloco: 'A',
          numeroCasa: '101'
        },
        agendamentos: [
          {
            id: 101,
            dia: '12',
            mes: '04',
            ano: '2026',
            hora: '14:00',
            preco: '85.00',
            animalId: 1,
            descricao: 'Banho e tosa completa.',
            atendente: 'Carlos'
          }
        ],
        animais: [
          {
            id: 1,
            nome: 'Thor',
            idade: '4 anos',
            altura: '55 cm',
            largura: '20 cm',
            comprimento: '70 cm',
            alimentoDia: '0,7 kg',
            raca: 'Golden Retriever',
            remediosTomados: 'Vacina V10, Antirrábica',
            remediosPendentes: 'Reforço anual V10',
            descricao: 'Animal dócil, gosta de brincar e é sensível a barulhos altos.',
            fotos: []
          },
          {
            id: 2,
            nome: 'Luna',
            idade: '2 anos',
            altura: '30 cm',
            largura: '15 cm',
            comprimento: '45 cm',
            alimentoDia: '0,3 kg',
            raca: 'Shih Tzu',
            remediosTomados: 'Antipulgas, Vermífugo',
            remediosPendentes: 'Vacina anual',
            descricao: 'Precisa de cuidado especial com os olhos.',
            fotos: []
          }
        ]
      },
      {
        id: 2,
        nomeCompleto: 'João Batista Lima',
        telefone: '(91) 99999-0002',
        endereco: {
          bairro: 'Marco',
          rua: 'Av. Central',
          cep: '66000-200',
          bloco: '',
          numeroCasa: '55'
        },
        agendamentos: [],
        animais: []
      }
    ];

    let selectedClientId = 1;
    let selectedPetId = null;
    let editingPetId = null;
    let selectedScheduleId = null;
    let editingScheduleId = null;
    let modalMode = 'view';
    let agendamentoMode = 'create';
    let currentPhotos = [];

    function init() {
      renderClientes();
      selectClient(selectedClientId);
      updateDescricaoCounter();
      updateAgDescricaoCounter();
    }

    function getSelectedClient() {
      return clientes.find(cliente => cliente.id === selectedClientId) || null;
    }

    function escapeHtml(text) {
      return String(text || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
    }

    function renderClientes(filter = '') {
      clientesList.innerHTML = '';
      const termo = filter.trim().toLowerCase();

      const filtrados = clientes.filter(cliente =>
        cliente.nomeCompleto.toLowerCase().includes(termo) ||
        (cliente.telefone || '').toLowerCase().includes(termo)
      );

      if (!filtrados.length) {
        clientesList.innerHTML = '<div class="list-empty">Nenhum cliente encontrado.</div>';
        return;
      }

      filtrados.forEach(cliente => {
        const div = document.createElement('div');
        div.className = 'list-item' + (cliente.id === selectedClientId ? ' active' : '');
        div.innerHTML = `
          <div class="client-card-title">${escapeHtml(cliente.nomeCompleto)}</div>
          <div class="client-card-sub">Telefone: ${escapeHtml(cliente.telefone || 'Não informado')}</div>
        `;

        div.addEventListener('click', () => {
          selectClient(cliente.id);
        });

        clientesList.appendChild(div);
      });
    }

    function selectClient(clientId) {
      selectedClientId = clientId;
      selectedPetId = null;
      selectedScheduleId = null;
      renderClientes(pesquisaCliente.value);
      fillClientProfile();
      renderAgendamentos();
      renderPets();
      fillAnimalSelect();
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
      perfilClienteNome.value = '';
      perfilClienteTelefone.value = '';
      perfilClienteBairro.value = '';
      perfilClienteRua.value = '';
      perfilClienteCep.value = '';
      perfilClienteBloco.value = '';
      perfilClienteNumeroCasa.value = '';
    }

    function saveClientProfile() {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente.');
        return;
      }

      const nome = perfilClienteNome.value.trim();
      const telefone = perfilClienteTelefone.value.trim();

      if (!nome || !telefone) {
        showAlertPopup('Aviso', 'Preencha nome completo e telefone.');
        return;
      }

      cliente.nomeCompleto = nome;
      cliente.telefone = telefone;
      cliente.endereco.bairro = perfilClienteBairro.value.trim();
      cliente.endereco.rua = perfilClienteRua.value.trim();
      cliente.endereco.cep = perfilClienteCep.value.trim();
      cliente.endereco.bloco = perfilClienteBloco.value.trim();
      cliente.endereco.numeroCasa = perfilClienteNumeroCasa.value.trim();

      renderClientes(pesquisaCliente.value);
      showAlertPopup('Sucesso', 'Perfil do cliente salvo com sucesso.');
    }

    function updateClientProfile() {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente.');
        return;
      }

      showConfirmPopup(
        'Atualizar cliente',
        'Deseja atualizar os dados deste cliente?',
        saveClientProfile
      );
    }

    function deleteClientProfile() {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente.');
        return;
      }

      showConfirmPopup(
        'Apagar perfil',
        `Deseja realmente apagar o perfil de "${cliente.nomeCompleto}"?`,
        () => {
          const index = clientes.findIndex(item => item.id === selectedClientId);
          if (index === -1) return;

          clientes.splice(index, 1);

          if (clientes.length) {
            selectedClientId = clientes[0].id;
            selectClient(selectedClientId);
          } else {
            selectedClientId = null;
            selectedPetId = null;
            selectedScheduleId = null;
            clearClientProfile();
            renderClientes(pesquisaCliente.value);
            renderAgendamentos();
            renderPets();
            fillAnimalSelect();
          }

          showAlertPopup('Sucesso', 'Perfil do cliente apagado com sucesso.');
        }
      );
    }

    function renderAgendamentos() {
      agendamentoList.innerHTML = '';
      const cliente = getSelectedClient();

      if (!cliente || !cliente.agendamentos.length) {
        agendamentoList.innerHTML = '<div class="list-empty">Este cliente não possui agendamentos.</div>';
        return;
      }

      cliente.agendamentos.forEach(item => {
        const animal = cliente.animais.find(pet => pet.id === item.animalId);
        const div = document.createElement('div');
        div.className = 'list-item' + (item.id === selectedScheduleId ? ' active' : '');
        div.innerHTML = `
          <div class="schedule-title">${escapeHtml(item.dia)}/${escapeHtml(item.mes)}/${escapeHtml(item.ano)} - ${escapeHtml(item.hora)}</div>
          <div class="schedule-sub">
            <strong>Preço:</strong> R$ ${escapeHtml(item.preco)}<br>
            <strong>Animal:</strong> ${escapeHtml(animal ? animal.nome : 'Não encontrado')}<br>
            <strong>Atendente:</strong> ${escapeHtml(item.atendente)}<br>
            <strong>Descrição:</strong> ${escapeHtml(item.descricao)}
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

      cliente.animais.forEach(animal => {
        const card = document.createElement('div');
        card.className = 'pet-card' + (animal.id === selectedPetId ? ' active' : '');
        card.dataset.id = animal.id;

        const imageUrl = animal.fotos.length ? animal.fotos[0].src : null;

        card.innerHTML = `
          <div class="pet-card-image">
            ${imageUrl
              ? `<img src="${imageUrl}" alt="Foto de ${escapeHtml(animal.nome || 'animal')}">`
              : `<span>Sem foto</span>`
            }
          </div>
          <div class="pet-card-body">
            <div class="pet-card-name">${escapeHtml(animal.nome || 'Sem nome')}</div>
            <div class="pet-card-breed">${escapeHtml(animal.raca || 'Raça não informada')}</div>
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

      cliente.animais.forEach(animal => {
        const option = document.createElement('option');
        option.value = animal.id;
        option.textContent = animal.nome || 'Sem nome';
        agAnimal.appendChild(option);
      });
    }

    function openClienteModal() {
      resetClienteForm();
      clienteModal.classList.add('active');
    }

    function closeClienteModal() {
      clienteModal.classList.remove('active');
      resetClienteForm();
    }

    function resetClienteForm() {
      clienteNomeCompleto.value = '';
      clienteTelefone.value = '';
      clienteBairro.value = '';
      clienteRua.value = '';
      clienteCep.value = '';
      clienteBloco.value = '';
      clienteNumeroCasa.value = '';
    }

    function saveCliente() {
      const nome = clienteNomeCompleto.value.trim();
      const telefone = clienteTelefone.value.trim();

      if (!nome || !telefone) {
        showAlertPopup('Aviso', 'Preencha nome completo e número de telefone.');
        return;
      }

      const novoCliente = {
        id: Date.now(),
        nomeCompleto: nome,
        telefone,
        endereco: {
          bairro: clienteBairro.value.trim(),
          rua: clienteRua.value.trim(),
          cep: clienteCep.value.trim(),
          bloco: clienteBloco.value.trim(),
          numeroCasa: clienteNumeroCasa.value.trim()
        },
        agendamentos: [],
        animais: []
      };

      clientes.push(novoCliente);
      selectedClientId = novoCliente.id;
      closeClienteModal();
      renderClientes(pesquisaCliente.value);
      selectClient(novoCliente.id);
      showAlertPopup('Sucesso', 'Cliente criado com sucesso.');
    }

    function openAgendamentoModal(mode) {
      const cliente = getSelectedClient();

      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
        return;
      }

      fillAnimalSelect();
      resetAgendamentoForm();
      agendamentoMode = mode;

      if (mode === 'create') {
        agendamentoModalTitle.textContent = 'Criar Agendamento';
      } else {
        if (selectedScheduleId === null) {
          showAlertPopup('Aviso', 'Selecione um agendamento para atualizar.');
          return;
        }

        const agendamento = cliente.agendamentos.find(item => item.id === selectedScheduleId);
        if (!agendamento) return;

        editingScheduleId = agendamento.id;
        agendamentoModalTitle.textContent = 'Atualizar Agendamento';
        agDia.value = agendamento.dia;
        agMes.value = agendamento.mes;
        agAno.value = agendamento.ano;
        agHora.value = agendamento.hora;
        agPreco.value = agendamento.preco;
        agAnimal.value = String(agendamento.animalId);
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
      agDia.value = '';
      agMes.value = '';
      agAno.value = '';
      agHora.value = '';
      agPreco.value = '';
      agAnimal.value = '';
      agDescricao.value = '';
      agAtendente.value = '';
      updateAgDescricaoCounter();
    }

    function saveAgendamento() {
      const cliente = getSelectedClient();
      if (!cliente) return;

      const dia = agDia.value.trim();
      const mes = agMes.value.trim();
      const ano = agAno.value.trim();
      const hora = agHora.value.trim();
      const preco = agPreco.value.trim();
      const animalId = Number(agAnimal.value);
      const descricao = agDescricao.value.trim();
      const atendente = agAtendente.value.trim();

      if (!dia || !mes || !ano || !hora || !preco || !animalId || !descricao || !atendente) {
        showAlertPopup('Aviso', 'Preencha todos os campos do agendamento.');
        return;
      }

      if (agendamentoMode === 'create') {
        cliente.agendamentos.push({
          id: Date.now(),
          dia,
          mes,
          ano,
          hora,
          preco,
          animalId,
          descricao,
          atendente
        });

        closeAgendamentoModal();
        renderAgendamentos();
        showAlertPopup('Sucesso', 'Agendamento criado com sucesso.');
        return;
      }

      const index = cliente.agendamentos.findIndex(item => item.id === editingScheduleId);
      if (index === -1) return;

      cliente.agendamentos[index] = {
        ...cliente.agendamentos[index],
        dia,
        mes,
        ano,
        hora,
        preco,
        animalId,
        descricao,
        atendente
      };

      closeAgendamentoModal();
      renderAgendamentos();
      showAlertPopup('Sucesso', 'Agendamento atualizado com sucesso.');
    }

    function deleteSelectedAgendamento() {
      const cliente = getSelectedClient();

      if (!cliente || selectedScheduleId === null) {
        showAlertPopup('Aviso', 'Selecione um agendamento para apagar.');
        return;
      }

      showConfirmPopup(
        'Confirmar exclusão',
        'Deseja realmente apagar este agendamento?',
        () => {
          cliente.agendamentos = cliente.agendamentos.filter(item => item.id !== selectedScheduleId);
          selectedScheduleId = null;
          renderAgendamentos();
          showAlertPopup('Sucesso', 'Agendamento apagado com sucesso.');
        }
      );
    }

    function openAnimalModal(mode, petId = null) {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
        return;
      }

      modalMode = mode;
      editingPetId = petId;
      resetAnimalForm();

      if (mode === 'create') {
        modalTitle.textContent = 'Cadastrar Perfil do Animal';
        setFormEditable(true);
        btnHabilitarEdicao.style.display = 'none';
      } else {
        const pet = cliente.animais.find(item => item.id === petId);
        if (!pet) return;

        fillAnimalForm(pet);
        const readOnly = mode === 'view';
        setFormEditable(!readOnly);
        btnHabilitarEdicao.style.display = 'inline-block';
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
      const fields = [
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
        animalFotos
      ];

      fields.forEach(field => {
        field.disabled = !canEdit;
      });

      btnSalvarAnimal.style.display = canEdit ? 'inline-block' : 'none';
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
      updateDescricaoCounter();
      renderPhotoManager();
    }

    function resetAnimalForm() {
      animalNome.value = '';
      animalIdade.value = '';
      animalAltura.value = '';
      animalLargura.value = '';
      animalComprimento.value = '';
      animalAlimento.value = '';
      animalRaca.value = '';
      animalRemediosTomados.value = '';
      animalRemediosPendentes.value = '';
      animalDescricao.value = '';
      animalFotos.value = '';
      currentPhotos = [];
      imageList.innerHTML = '';
      photoPreviewGrid.innerHTML = '';
      updateDescricaoCounter();
    }

    function getAnimalFormData() {
      return {
        nome: animalNome.value.trim(),
        idade: animalIdade.value.trim(),
        altura: animalAltura.value.trim(),
        largura: animalLargura.value.trim(),
        comprimento: animalComprimento.value.trim(),
        alimentoDia: animalAlimento.value.trim(),
        raca: animalRaca.value.trim(),
        remediosTomados: animalRemediosTomados.value.trim(),
        remediosPendentes: animalRemediosPendentes.value.trim(),
        descricao: animalDescricao.value.trim(),
        fotos: [...currentPhotos]
      };
    }

    function saveAnimal() {
      const cliente = getSelectedClient();
      if (!cliente) return;

      const data = getAnimalFormData();

      if (modalMode === 'create') {
        const newPet = {
          id: Date.now(),
          ...data
        };
        cliente.animais.push(newPet);
        selectedPetId = newPet.id;
        renderPets();
        fillAnimalSelect();
        closeAnimalModal();
        showAlertPopup('Sucesso', 'Animal cadastrado com sucesso.');
        return;
      }

      const petIndex = cliente.animais.findIndex(item => item.id === editingPetId);
      if (petIndex === -1) return;

      cliente.animais[petIndex] = {
        ...cliente.animais[petIndex],
        ...data
      };

      renderPets();
      fillAnimalSelect();
      closeAnimalModal();
      showAlertPopup('Sucesso', 'Dados do animal atualizados com sucesso.');
    }

    function deleteSelectedPet() {
      const cliente = getSelectedClient();

      if (!cliente || selectedPetId === null) {
        showAlertPopup('Aviso', 'Selecione um animal para apagar.');
        return;
      }

      const pet = cliente.animais.find(item => item.id === selectedPetId);
      if (!pet) return;

      showConfirmPopup(
        'Confirmar exclusão',
        `Deseja realmente apagar o animal "${pet.nome || 'Sem nome'}"?`,
        () => {
          cliente.animais = cliente.animais.filter(item => item.id !== selectedPetId);
          cliente.agendamentos = cliente.agendamentos.filter(item => item.animalId !== selectedPetId);
          selectedPetId = null;
          renderPets();
          renderAgendamentos();
          fillAnimalSelect();
          showAlertPopup('Sucesso', 'Animal apagado com sucesso.');
        }
      );
    }

    function updateSelectedPet() {
      if (selectedPetId === null) {
        showAlertPopup('Aviso', 'Selecione um animal para atualizar.');
        return;
      }

      openAnimalModal('edit', selectedPetId);
    }

    function renderPhotoManager() {
      imageList.innerHTML = '';
      photoPreviewGrid.innerHTML = '';

      if (!currentPhotos.length) return;

      currentPhotos.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'image-item';
        item.innerHTML = `
          <span class="image-name">${escapeHtml(photo.name)}</span>
          ${!animalFotos.disabled ? `<button type="button" class="remove-image-btn" data-index="${index}">×</button>` : ''}
        `;
        imageList.appendChild(item);

        const preview = document.createElement('div');
        preview.className = 'photo-preview-item';
        preview.innerHTML = `
          <img src="${photo.src}" alt="Foto ${index + 1}">
          <div>${escapeHtml(photo.name)}</div>
        `;
        photoPreviewGrid.appendChild(preview);
      });

      const removeButtons = imageList.querySelectorAll('.remove-image-btn');
      removeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const index = Number(btn.dataset.index);
          currentPhotos.splice(index, 1);
          renderPhotoManager();
        });
      });
    }

    function handlePhotoUpload(files) {
      const selectedFiles = Array.from(files);

      if (!selectedFiles.length) return;

      if (currentPhotos.length + selectedFiles.length > 3) {
        showAlertPopup('Limite excedido', 'É permitido adicionar no máximo 3 fotos por animal.');
        animalFotos.value = '';
        return;
      }

      selectedFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = function(e) {
          currentPhotos.push({
            name: file.name,
            src: e.target.result
          });
          renderPhotoManager();
        };
        reader.readAsDataURL(file);
      });

      animalFotos.value = '';
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
      popupActions.innerHTML = `
        <button type="button" class="btn btn-save" id="popupOkBtn">OK</button>
      `;
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

      document.getElementById('popupConfirmBtn').addEventListener('click', () => {
        closePopup();
        onConfirm();
      });

      document.getElementById('popupCancelBtn').addEventListener('click', closePopup);
    }

    function closePopup() {
      popupOverlay.classList.remove('active');
      popupActions.innerHTML = '';
    }

    pesquisaCliente.addEventListener('input', () => {
      renderClientes(pesquisaCliente.value);
    });

    btnCriarCliente.addEventListener('click', openClienteModal);
    btnFecharClienteModal.addEventListener('click', closeClienteModal);
    btnSalvarCliente.addEventListener('click', () => {
      showConfirmPopup('Salvar cliente', 'Deseja salvar este cliente?', saveCliente);
    });

    btnSalvarPerfilCliente.addEventListener('click', () => {
      showConfirmPopup('Salvar perfil', 'Deseja salvar o perfil deste cliente?', saveClientProfile);
    });

    btnAtualizarPerfilCliente.addEventListener('click', updateClientProfile);
    btnApagarPerfilCliente.addEventListener('click', deleteClientProfile);

    btnCriarAgendamento.addEventListener('click', () => {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
        return;
      }
      if (!cliente.animais.length) {
        showAlertPopup('Aviso', 'Cadastre pelo menos um animal para criar agendamento.');
        return;
      }
      openAgendamentoModal('create');
    });

    btnAtualizarAgendamento.addEventListener('click', () => {
      openAgendamentoModal('edit');
    });

    btnApagarAgendamento.addEventListener('click', deleteSelectedAgendamento);

    btnFecharAgendamentoModal.addEventListener('click', closeAgendamentoModal);
    btnSalvarAgendamento.addEventListener('click', () => {
      showConfirmPopup('Salvar agendamento', 'Deseja salvar este agendamento?', saveAgendamento);
    });

    btnAdicionarAnimal.addEventListener('click', () => {
      const cliente = getSelectedClient();
      if (!cliente) {
        showAlertPopup('Aviso', 'Selecione um cliente primeiro.');
        return;
      }
      openAnimalModal('create');
    });

    btnAtualizarAnimal.addEventListener('click', updateSelectedPet);
    btnApagarAnimal.addEventListener('click', deleteSelectedPet);

    btnFecharModal.addEventListener('click', closeAnimalModal);

    btnSalvarAnimal.addEventListener('click', () => {
      showConfirmPopup(
        'Salvar alterações',
        'Deseja salvar os dados do animal?',
        saveAnimal
      );
    });

    btnHabilitarEdicao.addEventListener('click', () => {
      if (editingPetId === null) return;
      modalMode = 'edit';
      modalTitle.textContent = 'Atualizar Perfil do Animal';
      setFormEditable(true);
      showAlertPopup('Edição liberada', 'Agora você pode atualizar os dados do animal e salvar as alterações.');
    });

    animalFotos.addEventListener('change', (e) => {
      if (animalFotos.disabled) return;
      handlePhotoUpload(e.target.files);
    });

    animalDescricao.addEventListener('input', updateDescricaoCounter);
    agDescricao.addEventListener('input', updateAgDescricaoCounter);

    animalModal.addEventListener('click', (e) => {
      if (e.target === animalModal) closeAnimalModal();
    });

    clienteModal.addEventListener('click', (e) => {
      if (e.target === clienteModal) closeClienteModal();
    });

    agendamentoModal.addEventListener('click', (e) => {
      if (e.target === agendamentoModal) closeAgendamentoModal();
    });

    popupOverlay.addEventListener('click', (e) => {
      if (e.target === popupOverlay) closePopup();
    });

    init();
  
