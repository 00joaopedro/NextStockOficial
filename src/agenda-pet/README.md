Agenda Pet backend module

Files added:
- src/agenda-pet/agenda-pet.module.ts
- src/agenda-pet/agenda-pet.controller.ts
- src/agenda-pet/agenda-pet.service.ts
- src/agenda-pet/dto/create-agenda-pet.dto.ts
- src/agenda-pet/dto/update-agenda-pet.dto.ts

How to use:
- The module uses the existing `PrismaService` (global) to access the DB.
- Prisma model `AgendaPet` was added to `prisma/schema.prisma`. Run `npx prisma generate` and `npx prisma migrate dev --name add_agenda_pet` to apply.

Frontend example to replace mock `atendimentos` variable:

```js
// fetch example
fetch('/api/agenda-pet?page=1&limit=12')
  .then(res => res.json())
  .then(({ data, meta }) => {
    // `data` is an array of agendamentos
    // map it to the frontend expected shape
    const atendimentos = data.map(item => ({
      id: item.id,
      cliente: item.cliente,
      animal: item.animal,
      atendente: item.atendente,
      servico: item.servico,
      data: new Date(item.data).toLocaleDateString(),
      hora: item.hora,
      preco: item.preco,
      descricao: item.descricao,
    }));

    // replace the frontend mock variable usage with this `atendimentos` array
  });
```

Preview notes:
- Mutating routes (`POST`, `PATCH`, `DELETE`) are prepared to be guarded for PREVIEW mode (add a guard and register it where appropriate).
