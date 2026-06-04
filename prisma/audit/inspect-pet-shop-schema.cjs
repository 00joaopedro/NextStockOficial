const { PrismaClient } = require('@prisma/client');

const datasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : undefined);

const expectedColumns = {
  agenda_pets: [
    'id', 'cliente', 'animal', 'atendente', 'servico', 'data', 'hora', 'preco',
    'descricao', 'createdAt', 'updatedAt', 'tenantId', 'branch_id', 'client_id',
    'pet_id',
  ],
  pet_clients: [
    'id', 'tenant_id', 'branch_id', 'name', 'phone', 'email', 'document',
    'address', 'notes', 'deleted_at', 'created_at', 'updated_at',
  ],
  pets: [
    'id', 'tenant_id', 'branch_id', 'client_id', 'name', 'species', 'breed',
    'birth_date', 'age_text', 'weight', 'height', 'width', 'length',
    'food_per_day', 'description', 'vaccines_taken', 'vaccines_pending',
    'deleted_at', 'created_at', 'updated_at',
  ],
  pet_photos: [
    'id', 'tenant_id', 'branch_id', 'pet_id', 'file_name', 'file_url',
    'storage_path', 'created_at',
  ],
};

async function main() {
  const columns = await prisma.$queryRawUnsafe(`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('pet_clients', 'pets', 'pet_photos', 'agenda_pets')
    ORDER BY table_name, ordinal_position
  `);
  const migrations = await prisma.$queryRawUnsafe(`
    SELECT migration_name, finished_at, rolled_back_at
    FROM public._prisma_migrations
    WHERE migration_name LIKE '%pet%'
       OR migration_name LIKE '%multitenant_security%'
    ORDER BY migration_name
  `);
  const actualColumns = new Map();
  for (const column of columns) {
    const names = actualColumns.get(column.table_name) ?? new Set();
    names.add(column.column_name);
    actualColumns.set(column.table_name, names);
  }
  const missingColumns = Object.fromEntries(
    Object.entries(expectedColumns).map(([table, expected]) => [
      table,
      expected.filter((column) => !actualColumns.get(table)?.has(column)),
    ]),
  );
  const sampleClient = await prisma.petClient.findFirst({
    select: { tenantId: true, branchId: true },
  });
  const endpointQueryProbe = sampleClient
    ? await prisma.petClient.findMany({
        where: {
          tenantId: sampleClient.tenantId,
          branchId: sampleClient.branchId,
          deletedAt: null,
        },
        include: {
          pets: {
            where: { branchId: sampleClient.branchId, deletedAt: null },
            include: {
              photos: { where: { branchId: sampleClient.branchId } },
            },
          },
        },
        take: 1,
      })
    : [];

  console.log(JSON.stringify({
    missingColumns,
    endpointQueryProbe: {
      ok: true,
      sampleClientFound: Boolean(sampleClient),
      rows: endpointQueryProbe.length,
    },
    columns,
    migrations,
  }, null, 2));
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error({
      code: error.code,
      message: error.message,
      meta: error.meta,
    });
    process.exitCode = 1;
  });
