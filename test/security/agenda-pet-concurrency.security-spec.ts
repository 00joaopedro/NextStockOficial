import { BadRequestException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AgendaPetService } from '../../src/agenda-pet/agenda-pet.service';
import {
  createBranch,
  createPet,
  createPetClient,
  createTenant,
} from '../factories/security.factory';
import { assertSafeTestDatabaseUrl } from '../helpers/test-database.guard';

function service(prisma: PrismaClient, tenantId: string, branchId: string) {
  return new AgendaPetService(
    prisma as any,
    {
      resolvePetShopContext: jest.fn().mockResolvedValue({
        tenantId,
        branchId,
        mode: 'petshop',
      }),
    } as any,
  );
}

function barrier(size: number) {
  let waiting = 0;
  let release!: () => void;
  const open = new Promise<void>((resolve) => {
    release = resolve;
  });
  return async <T>(work: () => Promise<T>) => {
    waiting += 1;
    if (waiting === size) release();
    await open;
    return work();
  };
}

describe('RC-016 agenda pet concurrency on PostgreSQL', () => {
  let prismaA: PrismaClient;
  let prismaB: PrismaClient;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    const databaseUrl = assertSafeTestDatabaseUrl(
      process.env.SECURITY_TEST_DATABASE_URL,
    );
    const url = new URL(databaseUrl);
    url.searchParams.set('connection_limit', '20');
    prismaA = new PrismaClient({ datasourceUrl: url.toString() });
    prismaB = new PrismaClient({ datasourceUrl: url.toString() });
    await Promise.all([prismaA.$connect(), prismaB.$connect()]);
  });

  afterAll(async () => {
    try {
      await prismaA.tenant.deleteMany({
        where: { id: { in: [...tenantIds] } },
      });
    } finally {
      await Promise.all([prismaA?.$disconnect(), prismaB?.$disconnect()]);
    }
  });

  async function fixture() {
    const tenant = await createTenant(prismaA);
    tenantIds.add(tenant.id);
    const branch = await createBranch(prismaA, tenant);
    const client = await createPetClient(prismaA, { tenant, branch });
    const petA = await createPet(prismaA, { tenant, branch, client });
    const petB = await createPet(prismaA, { tenant, branch, client });
    return { tenant, branch, client, petA, petB };
  }

  async function expectOneWinner(calls: Promise<unknown>[]) {
    const results = await Promise.allSettled(calls);
    const winners = results.filter((result) => result.status === 'fulfilled');
    const losers = results.filter((result) => result.status === 'rejected');
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0].reason).toBeInstanceOf(BadRequestException);
  }

  it('allows only one overlapping appointment for the same pet', async () => {
    const data = await fixture();
    const start = barrier(2);
    const startsAt = '2026-12-01T10:00:00.000Z';
    const calls = ['Ana', 'Bruna'].map((atendente, index) =>
      start(() =>
        service(
          index ? prismaB : prismaA,
          data.tenant.id,
          data.branch.id,
        ).create({
          cliente: 'ignored',
          animal: 'ignored',
          atendente,
          servico: 'Banho',
          data: '2026-12-01',
          hora: '10:00',
          preco: 50,
          clientId: data.client.id,
          petId: data.petA.id,
          startAt: startsAt,
          endAt: '2026-12-01T11:00:00.000Z',
        }),
      ),
    );
    await expectOneWinner(calls);
    await expect(
      prismaA.agendaPet.count({ where: { tenantId: data.tenant.id } }),
    ).resolves.toBe(1);
  });

  it('allows only one overlapping appointment for the same attendant', async () => {
    const data = await fixture();
    const start = barrier(2);
    const calls = [data.petA.id, data.petB.id].map((petId, index) =>
      start(() =>
        service(
          index ? prismaB : prismaA,
          data.tenant.id,
          data.branch.id,
        ).create({
          cliente: 'ignored',
          animal: 'ignored',
          atendente: 'Ana',
          servico: 'Banho',
          data: '2026-12-02',
          hora: '10:00',
          preco: 50,
          clientId: data.client.id,
          petId,
          startAt: '2026-12-02T10:00:00.000Z',
          endAt: '2026-12-02T11:00:00.000Z',
        }),
      ),
    );
    await expectOneWinner(calls);
    await expect(
      prismaA.agendaPet.count({ where: { tenantId: data.tenant.id } }),
    ).resolves.toBe(1);
  });
});
