import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditOutcome,
  AuditSeverity,
  PaymentConnectionStatus,
  PaymentIdempotencyExecution,
  PaymentIdempotencyExecutionStatus,
  PaymentIdempotencyOperationType,
  PaymentMethod,
  PaymentProviderCode,
  PaymentRoutingContext,
  PaymentTransactionStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import {
  CreateConnectionDto,
  CreatePixPaymentDto,
  CreateTerminalDto,
  SetRoutingDto,
} from './dto/payment-admin.dto';
import { PaymentCredentialsCryptoService } from './payment-credentials-crypto.service';
import { PaymentProviderRegistry } from './payment-provider.registry';
import {
  OAuthPaymentProviderAdapter,
  PixPaymentProviderAdapter,
  ProviderPayment,
} from './ports/payment-provider.interface';
import {
  capabilityForMethod,
  PAYMENT_CAPABILITIES,
  requireCapability,
} from './payment-capabilities';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private static readonly PIX_LEASE_MS = 30_000;
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
    return {
      connections,
      terminals,
      routes,
      capabilities: PAYMENT_CAPABILITIES,
      featureAvailability: {
        pagarme: process.env.PAGARME_ENABLED === 'true',
        pagarmePix: process.env.PAGARME_PIX_ENABLED === 'true',
        pagarmeCard: process.env.PAGARME_CARD_ENABLED === 'true',
        stone:
          process.env.STONE_ENABLED === 'true' &&
          process.env.STONE_TERMINALS_ENABLED === 'true',
        stoneRemote: false,
      },
    };
  }
  async createConnection(
    user: AuthenticatedUser | undefined,
    dto: CreateConnectionDto,
    branch?: string,
  ) {
    const c = await this.context(user, branch, true);
    if (dto.providerCode === PaymentProviderCode.STONE)
      throw new BadRequestException(
        'Stone aceita somente cadastro manual de terminal nesta etapa.',
      );
    if (
      dto.providerCode !== PaymentProviderCode.MERCADO_PAGO &&
      dto.providerCode !== PaymentProviderCode.PAGARME
    )
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
      const adapter = this.registry.get(connection.providerCode);
      if ('revokeConnection' in adapter)
        await (adapter as unknown as OAuthPaymentProviderAdapter)
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
    if (
      dto.providerCode === PaymentProviderCode.STONE &&
      (process.env.STONE_ENABLED !== 'true' ||
        process.env.STONE_TERMINALS_ENABLED !== 'true')
    )
      throw new ConflictException('Cadastro de terminais Stone desativado.');
    if (
      dto.providerCode === PaymentProviderCode.STONE &&
      dto.integrationMode &&
      !['MANUAL', 'LOCAL_SDK', 'TEF', 'UNAVAILABLE'].includes(
        dto.integrationMode,
      )
    )
      throw new BadRequestException('Stone remoto nao esta habilitado.');
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
        integrationMode: dto.integrationMode,
        notes: dto.notes?.trim(),
        capabilities:
          dto.providerCode === PaymentProviderCode.STONE
            ? {
                TERMINAL_CARD:
                  dto.integrationMode === 'LOCAL_SDK' ||
                  dto.integrationMode === 'TEF'
                    ? 'REQUIRES_LOCAL_SDK'
                    : 'UNSUPPORTED',
              }
            : undefined,
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
    if (connection.status !== 'ACTIVE' || !connection.lastValidatedAt)
      throw new ConflictException('A conexao deve estar ativa e validada.');
    requireCapability(connection.providerCode, capabilityForMethod(dto.method));
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
    const idempotencyKey = dto.idempotencyKey.trim();
    if (!/^[A-Za-z0-9._~-]{8,128}$/.test(idempotencyKey))
      throw new BadRequestException('Chave de idempotencia PIX invalida.');
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
    const claimToken = randomUUID();
    const externalReference = `ns-pix-${randomUUID()}`;
    const requestHash = this.pixRequestHash({
      tenantId: c.tenantId,
      branchId: c.branchId!,
      orderId: order.id,
      amountCents: order.totalCents,
      providerCode: route.connection.providerCode,
      connectionId: route.connection.id,
    });
    let execution: PaymentIdempotencyExecution;
    let ownsClaim = false;
    try {
      execution = await this.prisma.paymentIdempotencyExecution.create({
        data: {
          tenantId: c.tenantId,
          operationType: PaymentIdempotencyOperationType.PIX_CREATE,
          idempotencyKey,
          requestHash,
          providerCode: route.connection.providerCode,
          connectionId: route.connection.id,
          orderId: order.id,
          amountCents: order.totalCents,
          currency: 'BRL',
          externalReference,
          claimToken,
          leaseUntil: this.pixLease(),
        },
      });
      ownsClaim = true;
      this.pixLog('claim_created', execution.id);
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
      const existingExecution =
        await this.prisma.paymentIdempotencyExecution.findUnique({
          where: {
            tenantId_operationType_idempotencyKey: {
              tenantId: c.tenantId,
              operationType: PaymentIdempotencyOperationType.PIX_CREATE,
              idempotencyKey,
            },
          },
        });
      if (!existingExecution) throw error;
      execution = existingExecution;
      this.pixLog('claim_conflict', execution.id);
      const fixedHash = this.pixRequestHash({
        tenantId: c.tenantId,
        branchId: c.branchId!,
        orderId: order.id,
        amountCents: order.totalCents,
        providerCode: execution.providerCode,
        connectionId: execution.connectionId,
      });
      if (execution.requestHash !== fixedHash) {
        this.pixLog('payload_conflict', execution.id);
        throw new ConflictException(
          'A chave de idempotencia PIX ja foi usada com outra operacao.',
        );
      }
      if (execution.status === PaymentIdempotencyExecutionStatus.UNKNOWN)
        return this.reconcilePixExecution(execution);
      const observed = await this.observePixExecution(execution);
      if (observed) return observed;
      const refreshedExecution =
        await this.prisma.paymentIdempotencyExecution.findUnique({
          where: { id: execution.id },
        });
      if (!refreshedExecution) throw error;
      execution = refreshedExecution;
      if (
        execution.status === PaymentIdempotencyExecutionStatus.PROCESSING &&
        execution.leaseUntil &&
        execution.leaseUntil <= new Date()
      ) {
        this.pixLog('stuck_claim', execution.id);
        await this.prisma.paymentIdempotencyExecution.updateMany({
          where: {
            id: execution.id,
            status: PaymentIdempotencyExecutionStatus.PROCESSING,
            leaseUntil: { lte: new Date() },
          },
          data: {
            status: PaymentIdempotencyExecutionStatus.UNKNOWN,
            claimToken: null,
            leaseUntil: null,
            lastErrorCode: 'STALE_PROCESSING_CLAIM',
          },
        });
        return this.reconcilePixExecution({
          ...execution,
          status: PaymentIdempotencyExecutionStatus.UNKNOWN,
        });
      }
      if (
        execution.status ===
          PaymentIdempotencyExecutionStatus.FAILED_RETRYABLE ||
        (execution.status === PaymentIdempotencyExecutionStatus.CLAIMED &&
          execution.leaseUntil &&
          execution.leaseUntil <= new Date())
      ) {
        if (execution.status === PaymentIdempotencyExecutionStatus.CLAIMED)
          this.pixLog('stuck_claim', execution.id);
        const reclaimed =
          await this.prisma.paymentIdempotencyExecution.updateMany({
            where: {
              id: execution.id,
              tenantId: c.tenantId,
              OR: [
                { status: PaymentIdempotencyExecutionStatus.FAILED_RETRYABLE },
                {
                  status: PaymentIdempotencyExecutionStatus.CLAIMED,
                  leaseUntil: { lte: new Date() },
                },
              ],
            },
            data: {
              status: PaymentIdempotencyExecutionStatus.CLAIMED,
              claimToken,
              leaseUntil: this.pixLease(),
              attemptCount: { increment: 1 },
              lastErrorCode: null,
            },
          });
        ownsClaim = reclaimed.count === 1;
      }
      if (!ownsClaim) return this.pixExecutionResponse(execution);
    }

    return this.executePixClaim({
      execution,
      claimToken,
      tenantId: c.tenantId,
      orderId: order.id,
      amountCents: order.totalCents,
      description: dto.description || `Pedido ${order.id}`,
      idempotencyKey,
    });
  }

  private async executePixClaim(input: {
    execution: PaymentIdempotencyExecution;
    claimToken: string;
    tenantId: string;
    orderId: string;
    amountCents: number;
    description: string;
    idempotencyKey: string;
  }) {
    let providerCallStarted = false;
    try {
      const connection = await this.prisma.paymentConnection.findFirst({
        where: {
          id: input.execution.connectionId,
          tenantId: input.tenantId,
          status: PaymentConnectionStatus.ACTIVE,
        },
      });
      if (!connection?.encryptedCredentials)
        throw new ConflictException('Conexao PIX indisponivel.');
      const credentials = this.crypto.decrypt(
        connection.encryptedCredentials,
        input.tenantId,
        connection.id,
        connection.version,
      );
      const processing =
        await this.prisma.paymentIdempotencyExecution.updateMany({
          where: {
            id: input.execution.id,
            tenantId: input.tenantId,
            status: PaymentIdempotencyExecutionStatus.CLAIMED,
            claimToken: input.claimToken,
          },
          data: {
            status: PaymentIdempotencyExecutionStatus.PROCESSING,
            leaseUntil: this.pixLease(),
          },
        });
      if (processing.count !== 1)
        return this.pixExecutionResponse(input.execution);
      const adapter = this.registry.require(
        input.execution.providerCode,
        'PIX',
      ) as unknown as PixPaymentProviderAdapter;
      providerCallStarted = true;
      const created = await adapter.createPixPayment(
        credentials,
        {
          amountCents: input.amountCents,
          externalReference: input.execution.externalReference,
          description: input.description,
        },
        input.idempotencyKey,
      );
      return await this.completePixExecution({
        execution: input.execution,
        tenantId: input.tenantId,
        orderId: input.orderId,
        idempotencyKey: input.idempotencyKey,
        created,
      });
    } catch (error) {
      const status = providerCallStarted
        ? PaymentIdempotencyExecutionStatus.UNKNOWN
        : PaymentIdempotencyExecutionStatus.FAILED_RETRYABLE;
      await this.prisma.paymentIdempotencyExecution.updateMany({
        where: {
          id: input.execution.id,
          tenantId: input.tenantId,
          claimToken: input.claimToken,
          status: {
            in: [
              PaymentIdempotencyExecutionStatus.CLAIMED,
              PaymentIdempotencyExecutionStatus.PROCESSING,
            ],
          },
        },
        data: {
          status,
          claimToken: null,
          leaseUntil: null,
          lastErrorCode: this.safePixErrorCode(error),
        },
      });
      if (providerCallStarted) {
        this.pixLog('execution_unknown', input.execution.id);
        return {
          executionId: input.execution.id,
          executionStatus: PaymentIdempotencyExecutionStatus.UNKNOWN,
          externalReference: input.execution.externalReference,
          retryable: false,
          reconciliationRequired: true,
        };
      }
      throw error;
    }
  }

  private async completePixExecution(input: {
    execution: PaymentIdempotencyExecution;
    tenantId: string;
    orderId: string;
    idempotencyKey: string;
    created: ProviderPayment;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.paymentTransaction.upsert({
        where: {
          tenantId_idempotencyKey: {
            tenantId: input.tenantId,
            idempotencyKey: input.idempotencyKey,
          },
        },
        update: {},
        create: {
          tenantId: input.tenantId,
          orderId: input.orderId,
          providerCode: input.execution.providerCode,
          connectionId: input.execution.connectionId,
          externalReference: input.execution.externalReference,
          externalPaymentId: input.created.id,
          method: PaymentMethod.PIX,
          amountCents: input.execution.amountCents,
          idempotencyKey: input.idempotencyKey,
          status: this.status(input.created.status),
          externalStatus: input.created.status,
          metadata: {
            qrCode: input.created.qrCode,
            qrCodeBase64: input.created.qrCodeBase64,
          },
        },
      });
      await tx.paymentIdempotencyExecution.update({
        where: { id: input.execution.id },
        data: {
          status: PaymentIdempotencyExecutionStatus.SUCCEEDED,
          externalPaymentId: input.created.id,
          transactionId: transaction.id,
          claimToken: null,
          leaseUntil: null,
          completedAt: new Date(),
          lastErrorCode: null,
        },
      });
      return transaction;
    });
  }

  private async reconcilePixExecution(execution: PaymentIdempotencyExecution) {
    this.pixLog('reconciliation_started', execution.id);
    try {
      const connection = await this.prisma.paymentConnection.findFirst({
        where: {
          id: execution.connectionId,
          tenantId: execution.tenantId,
          status: PaymentConnectionStatus.ACTIVE,
        },
      });
      if (!connection?.encryptedCredentials)
        return this.pixExecutionResponse(execution);
      const adapter = this.registry.require(
        execution.providerCode,
        'PIX',
      ) as unknown as PixPaymentProviderAdapter;
      if (!adapter.findPixPaymentByExternalReference)
        return this.pixExecutionResponse(execution);
      const credentials = this.crypto.decrypt(
        connection.encryptedCredentials,
        execution.tenantId,
        connection.id,
        connection.version,
      );
      const found = await adapter.findPixPaymentByExternalReference(
        credentials,
        execution.externalReference,
      );
      if (!found) {
        this.pixLog('reconciliation_failed', execution.id);
        return this.pixExecutionResponse(execution);
      }
      if (!execution.orderId) return this.pixExecutionResponse(execution);
      const transaction = await this.completePixExecution({
        execution,
        tenantId: execution.tenantId,
        orderId: execution.orderId,
        idempotencyKey: execution.idempotencyKey,
        created: found,
      });
      this.pixLog('reconciliation_succeeded', execution.id);
      return transaction;
    } catch {
      this.pixLog('reconciliation_failed', execution.id);
      return this.pixExecutionResponse(execution);
    }
  }

  private async observePixExecution(execution: PaymentIdempotencyExecution) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if (execution.status === PaymentIdempotencyExecutionStatus.SUCCEEDED) {
        if (!execution.transactionId)
          return this.pixExecutionResponse(execution);
        return this.prisma.paymentTransaction.findFirst({
          where: { id: execution.transactionId, tenantId: execution.tenantId },
        });
      }
      if (
        execution.status !== PaymentIdempotencyExecutionStatus.CLAIMED &&
        execution.status !== PaymentIdempotencyExecutionStatus.PROCESSING
      )
        return execution.status ===
          PaymentIdempotencyExecutionStatus.FAILED_RETRYABLE
          ? null
          : this.pixExecutionResponse(execution);
      await new Promise((resolve) => setTimeout(resolve, 25));
      const refreshed =
        await this.prisma.paymentIdempotencyExecution.findUnique({
          where: { id: execution.id },
        });
      if (!refreshed) return null;
      execution = refreshed;
    }
    return null;
  }

  private pixExecutionResponse(execution: PaymentIdempotencyExecution) {
    return {
      executionId: execution.id,
      executionStatus: execution.status,
      externalReference: execution.externalReference,
      retryable:
        execution.status === PaymentIdempotencyExecutionStatus.FAILED_RETRYABLE,
      reconciliationRequired:
        execution.status === PaymentIdempotencyExecutionStatus.UNKNOWN,
    };
  }

  private pixRequestHash(input: {
    tenantId: string;
    branchId: string;
    orderId: string;
    amountCents: number;
    providerCode: string;
    connectionId: string;
  }) {
    const values = [
      'PIX_CREATE',
      input.tenantId,
      input.branchId,
      input.orderId,
      String(input.amountCents),
      'BRL',
      PaymentMethod.PIX,
      input.providerCode,
      input.connectionId,
    ];
    const canonical = values
      .map((value) => `${value.length}:${value}`)
      .join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  private pixLease() {
    return new Date(Date.now() + PaymentsService.PIX_LEASE_MS);
  }

  private isUniqueConflict(error: unknown) {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  private safePixErrorCode(error: unknown) {
    const name =
      error && typeof error === 'object' && 'name' in error
        ? String(error.name)
        : 'PixExecutionError';
    return name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80) || 'UNKNOWN';
  }

  private pixLog(event: string, executionId: string) {
    this.logger.log(
      `pix_idempotency event=${event} execution=${executionId.slice(0, 8)}`,
    );
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
  private record(
    c: {
      userId: string;
      role: Role;
      tenantId: string;
      branchId?: string | null;
    },
    eventType: string,
    targetId: string,
  ) {
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
