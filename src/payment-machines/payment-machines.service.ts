import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { MachineStatus, PaymentProvider, Prisma, SystemMode } from '@prisma/client';
import { isSuperAdmin } from '../auth/super-admin.util';
import { PrismaService } from '../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

  async list(user?: Express.AuthenticatedUser) {
    const tenant = await this.getTenantOrDemo(user);

    if (isSuperAdmin(user) && !tenant) {
      const machines = await this.prisma.paymentMachine.findMany({
        orderBy: { createdAt: 'desc' },
      });

      return {
        ok: true,
        mode: SystemMode.padrao,
        isSuperAdmin: true,
        machines: machines.map(this.formatMachine),
      };
    }

    if (!tenant) {
      return { ok: true, mode: SystemMode.visualizacao, machines: DEMO_MACHINES };
    }

    const machines = await this.prisma.paymentMachine.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      mode: tenant.mode,
      machines: machines.map(this.formatMachine),
    };
  }

  async create(user: Express.AuthenticatedUser | undefined, dto: CreatePaymentMachineDto) {
    const tenant = await this.requireWritableTenant(user, dto.tenantId);

    const machine = await this.prisma.paymentMachine.create({
      data: {
        tenantId: tenant.id,
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
  ) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantMachine(tenant.id, id, isSuperAdmin(user));

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
      where: { id },
      data,
    });

    return { ok: true, machine: this.formatMachine(machine) };
  }

  async remove(user: Express.AuthenticatedUser | undefined, id: string) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantMachine(tenant.id, id, isSuperAdmin(user));

    await this.prisma.paymentMachine.delete({ where: { id } });

    return { ok: true };
  }

  private async getTenantOrDemo(user?: Express.AuthenticatedUser) {
    if (isSuperAdmin(user) && !user?.tenantId) {
      return null;
    }

    if (!user?.tenantId) {
      return null;
    }

    return this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, mode: true },
    });
  }

  private async requireWritableTenant(
    user?: Express.AuthenticatedUser,
    requestedTenantId?: string | null,
  ) {
    if (isSuperAdmin(user)) {
      const tenantId = requestedTenantId ?? user?.tenantId ?? user?.primaryTenantId;

      if (!tenantId) {
        throw new ForbiddenException('tenantId is required for superAdmin writes.');
      }

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, mode: true },
      });

      if (!tenant) {
        throw new UnauthorizedException('Tenant not found.');
      }

      return tenant;
    }

    if (!user?.tenantId) {
      throw new ForbiddenException('Modo visualizacao: alteracao bloqueada.');
    }

    const tenant = await this.getTenantOrDemo(user);

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found.');
    }

    if (tenant.mode === SystemMode.visualizacao) {
      throw new ForbiddenException('Modo visualizacao: alteracao bloqueada.');
    }

    return tenant;
  }

  private async assertTenantMachine(tenantId: string, id: string, bypassTenant = false) {
    const machine = await this.prisma.paymentMachine.findFirst({
      where: bypassTenant ? { id } : { id, tenantId },
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
