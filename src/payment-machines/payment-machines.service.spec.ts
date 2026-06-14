import { NotFoundException } from '@nestjs/common';
import { MachineStatus, PaymentProvider, Prisma, Role, SystemMode, SystemType } from '@prisma/client';
import { PaymentMachinesService } from './payment-machines.service';

describe('PaymentMachinesService branch isolation', () => {
  const context = {
    userId: 'user-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    role: Role.Admin,
    systemType: SystemType.padrao,
    mode: SystemMode.padrao,
    isDevSuperAdmin: false,
  };
  const machine = {
    id: 'machine-a',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    name: 'Caixa A',
    provider: PaymentProvider.stone,
    model: 'S920',
    feePercent: new Prisma.Decimal(2.5),
    status: MachineStatus.ativa,
    externalProvider: null,
    externalReference: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setup() {
    const prisma = {
      paymentMachine: {
        findMany: jest.fn().mockResolvedValue([machine]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(machine),
        update: jest.fn().mockResolvedValue(machine),
      },
    };
    const tenantContext = {
      resolve: jest.fn().mockResolvedValue(context),
    };

    return {
      prisma,
      tenantContext,
      service: new PaymentMachinesService(prisma as any, tenantContext as any),
    };
  }

  it('lista e cria maquinas somente na branch resolvida pelo backend', async () => {
    const { service, prisma } = setup();

    await service.list({ id: 'user-a' } as any, 'branch-a');
    await service.create(
      { id: 'user-a' } as any,
      {
        name: 'Caixa A',
        provider: PaymentProvider.stone,
        model: 'S920',
        feePercent: 2.5,
      },
      'branch-a',
    );

    expect(prisma.paymentMachine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          deletedAt: null,
        }),
      }),
    );
    expect(prisma.paymentMachine.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-a',
          branchId: 'branch-a',
        }),
      }),
    );
  });

  it('branch A nao altera maquina da branch B', async () => {
    const { service, prisma } = setup();

    await expect(
      service.update({ id: 'user-a' } as any, 'machine-b', { name: 'Nope' }, 'branch-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.paymentMachine.update).not.toHaveBeenCalled();
  });

  it('faz soft delete e registra o usuario que alterou', async () => {
    const { service, prisma } = setup();
    prisma.paymentMachine.findFirst.mockResolvedValueOnce(machine);

    await service.remove({ id: 'user-a' } as any, 'machine-a', 'branch-a');

    expect(prisma.paymentMachine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'machine-a',
          tenantId: 'tenant-a',
          branchId: 'branch-a',
          deletedAt: null,
        }),
        data: expect.objectContaining({
          status: MachineStatus.inativa,
          deletedAt: expect.any(Date),
          updatedById: 'user-a',
        }),
      }),
    );
  });
});
