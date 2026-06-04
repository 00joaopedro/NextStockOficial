import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MachineStatus, PaymentProvider, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';

const DEMO_MACHINES = [
  {
    id: 'demo-stone',
    name: 'Stone - Caixa Principal',
    provider: PaymentProvider.stone,
    model: 'S920',
    feePercent: 2.99,
    status: MachineStatus.ativa,
    externalProvider: null,
    externalReference: null,
  },
  {
    id: 'demo-pagseguro',
    name: 'PagSeguro - Banho e Tosa',
    provider: PaymentProvider.pagseguro,
    model: 'Moderninha Pro',
    feePercent: 3.19,
    status: MachineStatus.ativa,
    externalProvider: null,
    externalReference: null,
  },
  {
    id: 'demo-mercado-pago',
    name: 'Mercado Pago - Recepcao',
    provider: PaymentProvider.mercado_pago,
    model: 'Point Smart',
    feePercent: 3.49,
    status: MachineStatus.inativa,
    externalProvider: 'mercado_pago',
    externalReference: null,
  },
];

@Injectable()
export class PaymentMachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(user?: Express.AuthenticatedUser, selectedBranchId?: string) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
    });

    const machines = await this.prisma.paymentMachine.findMany({
      where: { tenantId: context.tenantId, branchId: context.branchId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      mode: context.mode,
      machines: machines.map(this.formatMachine),
    };
  }

  async create(
    user: Express.AuthenticatedUser | undefined,
    dto: CreatePaymentMachineDto,
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });

    const machine = await this.prisma.paymentMachine.create({
      data: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        name: dto.name.trim(),
        provider: dto.provider,
        model: dto.model.trim(),
        feePercent: new Prisma.Decimal(dto.feePercent),
        status: dto.status ?? MachineStatus.ativa,
        externalProvider: dto.externalProvider?.trim() || null,
        externalReference: dto.externalReference?.trim() || null,
      },
    });

    return { ok: true, machine: this.formatMachine(machine) };
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdatePaymentMachineDto,
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    await this.assertTenantMachine(context.tenantId, context.branchId!, id);

    const data: Prisma.PaymentMachineUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.provider !== undefined) data.provider = dto.provider;
    if (dto.model !== undefined) data.model = dto.model.trim();
    if (dto.feePercent !== undefined) data.feePercent = new Prisma.Decimal(dto.feePercent);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.externalProvider !== undefined) {
      data.externalProvider = dto.externalProvider.trim() || null;
    }
    if (dto.externalReference !== undefined) {
      data.externalReference = dto.externalReference.trim() || null;
    }

    const machine = await this.prisma.paymentMachine.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
      data,
    });

    return { ok: true, machine: this.formatMachine(machine) };
  }

  async remove(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
  ) {
    const context = await this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowedRoles: [Role.Admin],
    });
    await this.assertTenantMachine(context.tenantId, context.branchId!, id);

    await this.prisma.paymentMachine.delete({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
      },
    });

    return { ok: true };
  }

  private async assertTenantMachine(tenantId: string, branchId: string, id: string) {
    const machine = await this.prisma.paymentMachine.findFirst({
      where: { id, tenantId, branchId },
      select: { id: true },
    });

    if (!machine) {
      throw new NotFoundException('Payment machine not found.');
    }
  }

  private formatMachine(machine: {
    id: string;
    name: string;
    provider: PaymentProvider;
    model: string;
    feePercent: Prisma.Decimal | number;
    status: MachineStatus;
    externalProvider: string | null;
    externalReference: string | null;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      ...machine,
      feePercent: Number(machine.feePercent),
    };
  }
}
