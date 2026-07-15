import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MachineStatus, PaymentProvider, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';

@Injectable()
export class PaymentMachinesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async list(
    user?: AuthenticatedUser,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
      [Role.Admin, Role.Vendedor, Role.Comprador],
    );
    const machines = await this.prisma.paymentMachine.findMany({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      mode: context.mode,
      machines: machines.map((machine) => this.formatMachine(machine)),
    };
  }

  async create(
    user: AuthenticatedUser | undefined,
    dto: CreatePaymentMachineDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const data = this.normalizeCreateDto(dto);

    await this.assertUnique(context.tenantId, context.branchId!, data);

    const machine = await this.prisma.paymentMachine.create({
      data: {
        tenantId: context.tenantId,
        branchId: context.branchId,
        ...data,
        createdById: context.userId,
        updatedById: context.userId,
      },
    });

    return { ok: true, machine: this.formatMachine(machine) };
  }

  async update(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdatePaymentMachineDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    const current = await this.findScopedMachine(
      context.tenantId,
      context.branchId!,
      id,
    );
    const data = this.normalizeUpdateDto(dto);
    const identity = {
      name: (data.name as string | undefined) ?? current.name,
      provider:
        (data.provider as PaymentProvider | undefined) ?? current.provider,
      model: (data.model as string | undefined) ?? current.model,
      externalProvider:
        data.externalProvider !== undefined
          ? (data.externalProvider as string | null)
          : current.externalProvider,
      externalReference:
        data.externalReference !== undefined
          ? (data.externalReference as string | null)
          : current.externalReference,
    };

    await this.assertUnique(
      context.tenantId,
      context.branchId!,
      identity,
      current.id,
    );

    const machine = await this.prisma.paymentMachine.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      },
      data: {
        ...data,
        updatedById: context.userId,
      },
    });

    return { ok: true, machine: this.formatMachine(machine) };
  }

  async remove(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      [Role.Admin],
    );
    await this.findScopedMachine(context.tenantId, context.branchId!, id);

    await this.prisma.paymentMachine.update({
      where: {
        id,
        tenantId: context.tenantId,
        branchId: context.branchId,
        deletedAt: null,
      },
      data: {
        status: MachineStatus.inativa,
        deletedAt: new Date(),
        updatedById: context.userId,
      },
    });

    return { ok: true };
  }

  private resolveContext(
    user: AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
    allowedRoles: Role[],
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles,
      allowDevSupport: devContextMode?.trim().toLowerCase() === 'support',
    });
  }

  private findScopedMachine(tenantId: string, branchId: string, id: string) {
    return this.prisma.paymentMachine
      .findFirst({
        where: { id, tenantId, branchId, deletedAt: null },
      })
      .then((machine) => {
        if (!machine) {
          throw new NotFoundException('Maquininha nao encontrada.');
        }
        return machine;
      });
  }

  private async assertUnique(
    tenantId: string,
    branchId: string,
    input: {
      name: string;
      provider: PaymentProvider;
      model: string;
      externalProvider?: string | null;
      externalReference?: string | null;
    },
    exceptId?: string,
  ) {
    const conditions: Prisma.PaymentMachineWhereInput[] = [
      {
        name: { equals: input.name, mode: 'insensitive' },
        provider: input.provider,
        model: { equals: input.model, mode: 'insensitive' },
      },
    ];

    if (input.externalProvider && input.externalReference) {
      conditions.push({
        externalProvider: input.externalProvider,
        externalReference: input.externalReference,
      });
    }

    const duplicate = await this.prisma.paymentMachine.findFirst({
      where: {
        tenantId,
        branchId,
        deletedAt: null,
        OR: conditions,
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'Ja existe uma maquininha com a mesma identificacao nesta filial.',
      );
    }
  }

  private normalizeCreateDto(dto: CreatePaymentMachineDto) {
    return {
      name: this.cleanRequired(dto.name, 'Nome'),
      provider: dto.provider,
      model: this.cleanRequired(dto.model, 'Modelo'),
      feePercent: new Prisma.Decimal(dto.feePercent),
      status: dto.status ?? MachineStatus.ativa,
      externalProvider: this.cleanNullable(dto.externalProvider),
      externalReference: this.cleanNullable(dto.externalReference),
    };
  }

  private normalizeUpdateDto(dto: UpdatePaymentMachineDto) {
    const data: Prisma.PaymentMachineUncheckedUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = this.cleanRequired(dto.name, 'Nome');
    }
    if (dto.provider !== undefined) {
      data.provider = dto.provider;
    }
    if (dto.model !== undefined) {
      data.model = this.cleanRequired(dto.model, 'Modelo');
    }
    if (dto.feePercent !== undefined) {
      data.feePercent = new Prisma.Decimal(dto.feePercent);
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
    }
    if (dto.externalProvider !== undefined) {
      data.externalProvider = this.cleanNullable(dto.externalProvider);
    }
    if (dto.externalReference !== undefined) {
      data.externalReference = this.cleanNullable(dto.externalReference);
    }

    return data;
  }

  private cleanRequired(value: string, field: string) {
    const cleaned = value.replace(/\s+/g, ' ').trim();

    if (!cleaned) {
      throw new BadRequestException(`${field} nao pode ficar vazio.`);
    }

    return cleaned;
  }

  private cleanNullable(value?: string | null) {
    const cleaned = value?.replace(/\s+/g, ' ').trim();
    return cleaned || null;
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
