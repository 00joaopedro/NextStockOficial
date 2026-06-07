import { Prisma } from '@prisma/client';

export type AgendaPetListMeta = {
  page: number;
  pageSize: number;
  total: number;
};

export function formatAgendaPet(agenda: any) {
  return {
    id: agenda.id,
    clientId: agenda.clientId,
    petId: agenda.petId,
    cliente: agenda.cliente,
    animal: agenda.animal,
    servico: agenda.servico,
    atendente: agenda.atendente,
    preco: agenda.preco,
    descricao: agenda.descricao,
    notes: agenda.notes,
    status: agenda.status,
    startAt: agenda.startAt,
    endAt: agenda.endAt,
    data: agenda.data,
    hora: agenda.hora,
    client: agenda.client,
    pet: agenda.pet,
    canceledAt: agenda.canceledAt,
    cancellationReason: agenda.cancellationReason,
    createdAt: agenda.createdAt,
    updatedAt: agenda.updatedAt,
  };
}

export function formatAgendaPetList(rows: any[], meta: AgendaPetListMeta) {
  const items = rows.map((row) => formatAgendaPet(row));

  return {
    items,
    data: items,
    page: meta.page,
    pageSize: meta.pageSize,
    total: meta.total,
    totalPages: Math.ceil(meta.total / meta.pageSize) || 0,
  };
}

export const agendaPetListInclude = {
  client: { select: { id: true, name: true } },
  pet: { select: { id: true, name: true, clientId: true } },
};

export const agendaPetListOrderBy: Prisma.AgendaPetOrderByWithRelationInput[] = [
  { startAt: 'asc' },
  { data: 'asc' },
  { hora: 'asc' },
];
