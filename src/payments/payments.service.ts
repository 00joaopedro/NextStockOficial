import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditOutcome,
  AuditSeverity,
  PaymentConnectionStatus,
  PaymentMethod,
  PaymentProviderCode,
  PaymentRoutingContext,
  PaymentTransactionStatus,
  Role,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  CreateConnectionDto,
  CreatePixPaymentDto,
  CreateTerminalDto,
  SetRoutingDto,
} from './dto/payment-admin.dto';
import { MercadoPagoAdapter } from './adapters/mercado-pago.adapter';
import { PaymentCredentialsCryptoService } from './payment-credentials-crypto.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  OAuthPaymentProviderAdapter,
  PixPaymentProviderAdapter,
} from './ports/payment-provider.interface';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private contexts: TenantContextService,
    private registry: PaymentProviderRegistry,
    private crypto: PaymentCredentialsCryptoService,
    private audit: AuditService,
  ) {}
  private context(
    user: AuthenticatedUser | undefined,
    branch?: string,
    writable = false,
  ) {
    return this.contexts.resolve(user, {
      selectedBranchId: branch,
      requireBranch: true,
      writable,
      allowedRoles: writable
        ? [Role.Admin]
        : [Role.Admin, Role.Vendedor, Role.Comprador],
    });
  }
  async configuration(user: AuthenticatedUser | undefined, branch?: string) {
    const c = await this.context(user, branch);
    const [connections, terminals, routes] = await Promise.all([
      this.prisma.paymentConnection.findMany({
        where: { tenantId: c.tenantId },
        select: {
          id: true,
          providerCode: true,
          displayName: true,
          externalAccountId: true,
          status: true,
          capabilities: true,
          credentialsExpireAt: true,
          scopes: true,
          lastValidatedAt: true,
          sanitizedError: true,
          version: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.paymentTerminal.findMany({
        where: { tenantId: c.tenantId, branchId: c.branchId! },
        orderBy: { nickname: 'asc' },
      }),
      this.prisma.paymentRoutingPreference.findMany({
        where: { tenantId: c.tenantId },
        include: {
          connection: {
            select: { displayName: true, providerCode: true, status: true },
          },
        },
      }),
    ]);
    return { connections, terminals, routes };
  }
  async createConnection(
    user: AuthenticatedUser | undefined,
    dto: CreateConnectionDto,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    if (dto.providerCode !== PaymentProviderCode.MERCADO_PAGO)
      throw new BadRequestException('Provedor ainda nao disponivel.');
    const adapter = this.registry.get(dto.providerCode);
    const credentials = { accessToken: dto.accessToken.trim() };
    const validated = await adapter.validateConnection(credentials);
    const id = randomUUID();
    const encrypted = this.crypto.encrypt(credentials, c.tenantId, id, 1);
    const connection = await this.prisma.paymentConnection.create({
      data: {
        id,
        tenantId: c.tenantId,
        providerCode: dto.providerCode,
        displayName: dto.displayName.trim(),
        externalAccountId: validated.externalAccountId,
        status: PaymentConnectionStatus.ACTIVE,
        capabilities: validated.capabilities,
        encryptedCredentials: encrypted,
        lastValidatedAt: new Date(),
      },
      select: {
        id: true,
        providerCode: true,
        displayName: true,
        externalAccountId: true,
        status: true,
        capabilities: true,
        lastValidatedAt: true,
        version: true,
      },
    });
    await this.record(c, 'payment.connection.created', connection.id);
    return connection;
  }
  async validateConnection(
    user: AuthenticatedUser | undefined,
    id: string,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    const connection = await this.connection(c.tenantId, id);
    const credentials = this.crypto.decrypt(
      connection.encryptedCredentials!,
      c.tenantId,
      id,
      connection.version,
    );
    try {
      const result = await this.registry
        .get(connection.providerCode)
        .validateConnection(credentials);
      await this.prisma.paymentConnection.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          externalAccountId: result.externalAccountId,
          capabilities: result.capabilities,
          lastValidatedAt: new Date(),
          sanitizedError: null,
        },
      });
      return { valid: true, ...result };
    } catch (error) {
      await this.prisma.paymentConnection.update({
        where: { id },
        data: {
          status: 'ERROR',
          sanitizedError: 'Nao foi possivel validar a conexao.',
        },
      });
      throw error;
    }
  }
  async revokeConnection(
    user: AuthenticatedUser | undefined,
    id: string,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    const connection = await this.connection(c.tenantId, id);
    if (connection.encryptedCredentials) {
      const credentials = this.crypto.decrypt(
        connection.encryptedCredentials,
        c.tenantId,
        id,
        connection.version,
      );
      await (
        this.registry.get(
          connection.providerCode,
        ) as unknown as OAuthPaymentProviderAdapter
      )
        .revokeConnection(credentials)
        .catch(() => undefined);
    }
    await this.prisma.$transaction([
      this.prisma.paymentRoutingPreference.deleteMany({
        where: { tenantId: c.tenantId, connectionId: id },
      }),
      this.prisma.paymentConnection.update({
        where: { id },
        data: {
          status: 'REVOKED',
          encryptedCredentials: null,
          version: { increment: 1 },
        },
      }),
    ]);
    await this.record(c, 'payment.connection.revoked', id);
    return { revoked: true };
  }
  async createTerminal(
    user: AuthenticatedUser | undefined,
    dto: CreateTerminalDto,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    if (dto.connectionId) {
      const conn = await this.connection(c.tenantId, dto.connectionId);
      if (conn.providerCode !== dto.providerCode)
        throw new BadRequestException(
          'Terminal e conexao usam provedores diferentes.',
        );
    }
    const terminal = await this.prisma.paymentTerminal.create({
      data: {
        tenantId: c.tenantId,
        branchId: c.branchId!,
        nickname: dto.nickname.trim(),
        providerCode: dto.providerCode,
        connectionId: dto.connectionId,
        manufacturer: dto.manufacturer?.trim(),
        model: dto.model?.trim(),
        externalDeviceId: dto.externalDeviceId?.trim(),
        serialNumberMasked: this.mask(dto.serialNumber),
        status: dto.status,
      },
    });
    await this.record(c, 'payment.terminal.created', terminal.id);
    return terminal;
  }
  async removeTerminal(
    user: AuthenticatedUser | undefined,
    id: string,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    const found = await this.prisma.paymentTerminal.findFirst({
      where: { id, tenantId: c.tenantId, branchId: c.branchId! },
    });
    if (!found) throw new NotFoundException('Terminal nao encontrado.');
    await this.prisma.paymentTerminal.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });
    return { inactive: true };
  }
  async setRouting(
    user: AuthenticatedUser | undefined,
    dto: SetRoutingDto,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    const connection = await this.connection(c.tenantId, dto.connectionId);
    if (connection.status !== 'ACTIVE')
      throw new ConflictException('A conexao deve estar ativa.');
    return this.prisma.paymentRoutingPreference.upsert({
      where: {
        tenantId_method_context: {
          tenantId: c.tenantId,
          method: dto.method,
          context: dto.context,
        },
      },
      create: {
        tenantId: c.tenantId,
        connectionId: dto.connectionId,
        method: dto.method,
        context: dto.context,
      },
      update: { connectionId: dto.connectionId, isActive: true },
    });
  }
  async createPix(
    user: AuthenticatedUser | undefined,
    dto: CreatePixPaymentDto,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    const order = await this.prisma.order.findFirst({
      where: {
        id: dto.orderId,
        tenantId: c.tenantId,
        branchId: c.branchId!,
        deletedAt: null,
      },
    });
    if (!order || order.totalCents !== dto.amountCents)
      throw new BadRequestException('Pedido ou valor invalido.');
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: {
        tenantId_idempotencyKey: {
          tenantId: c.tenantId,
          idempotencyKey: dto.idempotencyKey,
        },
      },
    });
    if (existing) return existing;
    const route = await this.prisma.paymentRoutingPreference.findUnique({
      where: {
        tenantId_method_context: {
          tenantId: c.tenantId,
          method: PaymentMethod.PIX,
          context: PaymentRoutingContext.CHECKOUT,
        },
      },
      include: { connection: true },
    });
    if (!route?.isActive || route.connection.status !== 'ACTIVE')
      throw new ConflictException('Configure uma rota PIX ativa.');
    const credentials = this.crypto.decrypt(
      route.connection.encryptedCredentials!,
      c.tenantId,
      route.connection.id,
      route.connection.version,
    );
    const externalReference = `ns-${c.tenantId}-${randomUUID()}`;
    const created = await (
      this.registry.get(
        route.connection.providerCode,
      ) as unknown as PixPaymentProviderAdapter
    ).createPixPayment(
      credentials,
      {
        amountCents: dto.amountCents,
        externalReference,
        description: dto.description || `Pedido ${order.id}`,
      },
      dto.idempotencyKey,
    );
    return this.prisma.paymentTransaction.create({
      data: {
        tenantId: c.tenantId,
        orderId: order.id,
        providerCode: route.connection.providerCode,
        connectionId: route.connection.id,
        externalReference,
        externalPaymentId: created.id,
        method: 'PIX',
        amountCents: dto.amountCents,
        idempotencyKey: dto.idempotencyKey,
        status: this.status(created.status),
        externalStatus: created.status,
        metadata: {
          qrCode: created.qrCode,
          qrCodeBase64: created.qrCodeBase64,
        },
      },
    });
  }
  private async connection(tenantId: string, id: string) {
    const c = await this.prisma.paymentConnection.findFirst({
      where: { id, tenantId },
    });
    if (!c) throw new NotFoundException('Conexao nao encontrada.');
    return c;
  }
  private mask(value?: string) {
    const v = String(value || '').trim();
    return v
      ? v.length <= 4
        ? '****'
        : `${'*'.repeat(Math.min(8, v.length - 4))}${v.slice(-4)}`
      : null;
  }
  private status(value: string) {
    return value === 'approved'
      ? PaymentTransactionStatus.APPROVED
      : value === 'rejected'
        ? PaymentTransactionStatus.REJECTED
        : PaymentTransactionStatus.PENDING;
  }
  private record(c: any, eventType: string, targetId: string) {
    return this.audit.record({
      eventType,
      severity: AuditSeverity.HIGH,
      actorProfileId: c.userId,
      actorRole: c.role,
      tenantId: c.tenantId,
      branchId: c.branchId,
      targetType: 'payment',
      targetId,
      action: eventType,
      outcome: AuditOutcome.SUCCESS,
    });
  }
}
