(function () {
  const STATUS_LABELS = {
    scheduled: 'Agendado',
    confirmed: 'Confirmado',
    in_progress: 'Em andamento',
    completed: 'Concluido',
    canceled: 'Cancelado',
    no_show: 'Nao compareceu',
  };

  function parseDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function resolveStartDate(item) {
    const startAt = parseDate(item.startAt || item.start_at);
    if (startAt) return startAt;

    if (item.data && item.hora) {
      const legacyDate = typeof item.data === 'string'
        ? item.data.slice(0, 10)
        : new Date(item.data).toISOString().slice(0, 10);
      return parseDate(`${legacyDate}T${item.hora}:00`);
    }

    return parseDate(item.data);
  }

  function normalizeAppointment(item) {
    const startDate = resolveStartDate(item);
    const endDate = parseDate(item.endAt || item.end_at);
    const status = item.status || 'scheduled';
    const petId = item.petId || item.pet_id || item.pet?.id || null;
    const clientId = item.clientId || item.client_id || item.client?.id || null;

    return {
      id: item.id,
      clientId,
      petId,
      cliente: item.cliente || item.client?.name || '',
      animal: item.animal || item.pet?.name || '',
      servico: item.servico || item.descricao || 'Atendimento Pet',
      atendente: item.atendente || '',
      preco: Number(item.preco ?? 0),
      descricao: item.descricao || item.notes || '',
      notes: item.notes || item.descricao || '',
      status,
      statusLabel: STATUS_LABELS[status] || status,
      startAt: startDate ? startDate.toISOString() : null,
      endAt: endDate ? endDate.toISOString() : null,
      data: item.data || null,
      hora: item.hora || (startDate ? toTimeInput(startDate) : ''),
      deletedAt: item.deletedAt || item.deleted_at || null,
      canceledAt: item.canceledAt || item.canceled_at || null,
      cancellationReason: item.cancellationReason || item.cancellation_reason || null,
      createdAt: item.createdAt || item.created_at || null,
      updatedAt: item.updatedAt || item.updated_at || null,
      dia: startDate ? String(startDate.getDate()).padStart(2, '0') : '',
      mes: startDate ? String(startDate.getMonth() + 1).padStart(2, '0') : '',
      ano: startDate ? String(startDate.getFullYear()) : '',
      horaLocal: startDate ? toTimeInput(startDate) : (item.hora || ''),
    };
  }

  function toTimeInput(date) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  function formatDateTime(item) {
    const normalized = item.startAt ? item : normalizeAppointment(item);
    const startDate = parseDate(normalized.startAt);
    if (!startDate) return normalized.hora || 'Nao informado';

    return `${startDate.toLocaleDateString('pt-BR')} ${startDate.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  window.NextStockAgenda = {
    STATUS_LABELS,
    normalizeAppointment,
    formatDateTime,
  };
})();
