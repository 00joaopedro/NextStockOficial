import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  FiscalEnvironment,
  OrderStatus,
  Prisma,
  Role,
  SaleDocumentStatus,
  SaleDocumentType,
  SaleStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { CancelFiscalDocumentDto } from './dto/cancel-fiscal-document.dto';
import { CompanyFiscalConfigDto } from './dto/company-fiscal-config.dto';
import { CreateNfe55DocumentDto } from './dto/create-nfe55-document.dto';
import { Nfe55DraftQueryDto } from './dto/nfe55-draft-query.dto';
import { SendFiscalDocumentDto } from './dto/send-fiscal-document.dto';
import {
  FiscalProvider,
  FiscalProviderDocument,
} from './fiscal-provider.interface';
import { FiscalSequenceService } from './fiscal-sequence.service';
import { FiscalStorageService } from './fiscal-storage.service';
import { FiscalValidationService } from './fiscal-validation.service';
import { MockFiscalProvider } from './providers/mock-fiscal-provider';

const DOCUMENT_INCLUDE = {
  items: { orderBy: { createdAt: 'asc' as const } },
  events: { orderBy: { createdAt: 'desc' as const } },
  sale: {
    include: {
      order: true,
      payments: { orderBy: { createdAt: 'asc' as const } },
      items: {
        orderBy: { createdAt: 'asc' as const },
        include: { product: true },
      },
    },
  },
} satisfies Prisma.SaleDocumentInclude;

const SALE_FISCAL_INCLUDE = {
  order: true,
  documents: {
    where: { deletedAt: null },
    select: { id: true, type: true, status: true },
  },
  payments: { orderBy: { createdAt: 'asc' as const } },
  items: {
    orderBy: { createdAt: 'asc' as const },
    include: { product: true },
  },
} satisfies Prisma.SaleInclude;

type FiscalDocumentWithRelations = Prisma.SaleDocumentGetPayload<{
  include: typeof DOCUMENT_INCLUDE;
}>;
type FiscalSale = Prisma.SaleGetPayload<{
  include: typeof SALE_FISCAL_INCLUDE;
}>;

const READ_ROLES = [Role.Admin, Role.Vendedor];
const WRITE_ROLES = [Role.Admin];

@Injectable()
export class FiscalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly validation: FiscalValidationService,
    private readonly sequence: FiscalSequenceService,
    private readonly storage: FiscalStorageService,
    private readonly mockProvider: MockFiscalProvider,
  ) {}

  async getNfe55Draft(
    user: Express.AuthenticatedUser | undefined,
    query: Nfe55DraftQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if ((!query.orderId && !query.saleId) || (query.orderId && query.saleId)) {
      throw new BadRequestException('Informe exatamente um orderId ou saleId.');
    }
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const config = await this.loadConfig(context.tenantId, context.branchId!);

    if (query.saleId) {
      const sale = await this.findScopedSale(
        context.tenantId,
        context.branchId!,
        query.saleId,
      );
      return this.buildDraftFromSale(sale, config);
    }

    const order = await this.prisma.order.findFirst({
      where: {
        id: query.orderId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
        deletedAt: null,
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: { product: true },
        },
        sale: { select: { id: true, status: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido nao encontrado.');
    }

    return {
      source: 'order',
      orderId: order.id,
      saleId: order.sale?.id ?? null,
      eligibleForEmission:
        order.sale?.status === SaleStatus.paid &&
        order.status !== OrderStatus.canceled &&
        order.status !== OrderStatus.refunded,
      eligibilityMessage: order.sale
        ? 'Use a venda paga associada para emitir a NF-e.'
        : 'Pedido pode preencher o rascunho, mas a emissao exige pagamento confirmado e Sale.',
      company: this.formatConfig(config),
      recipient: {
        name: order.customerName,
        document: order.customerDocument,
        email: order.customerEmail,
        phone: order.customerPhone,
      },
      items: order.items.map((item) =>
        this.formatDraftItem({
          id: item.id,
          productId: item.productId,
          productNameSnapshot: item.productNameSnapshot,
          skuSnapshot: item.skuSnapshot,
          barcodeSnapshot: item.barcodeSnapshot,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalPriceCents: item.totalPriceCents,
          product: item.product,
        }),
      ),
      totals: {
        subtotalCents: order.subtotalCents,
        discountCents: order.discountCents,
        freightCents: 0,
        totalCents: order.totalCents,
      },
    };
  }

  async getDocument(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const document = await this.findScopedDocument(
      context.tenantId,
      context.branchId!,
      id,
    );
    return { document: this.formatDocument(document) };
  }

  async createDocument(
    user: Express.AuthenticatedUser | undefined,
    dto: CreateNfe55DocumentDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      WRITE_ROLES,
    );
    const idempotent = await this.prisma.saleDocument.findFirst({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId!,
        idempotencyKey: dto.idempotencyKey,
        deletedAt: null,
      },
      include: DOCUMENT_INCLUDE,
    });
    if (idempotent) {
      return {
        ok: true,
        idempotent: true,
        document: this.formatDocument(idempotent),
      };
    }

    const sale = await this.findScopedSale(
      context.tenantId,
      context.branchId!,
      dto.saleId,
    );
    if (
      sale.documents.some(
        (document) => document.type === SaleDocumentType.receipt,
      )
    ) {
      throw new BadRequestException(
        'Venda com recibo interno nao pode gerar NF-e 55 automaticamente.',
      );
    }
    const config = await this.loadConfig(context.tenantId, context.branchId!);
    this.validation.assertSaleEligible(sale);
    this.validation.assertConfig(config);
    this.validation.assertRecipient(dto.recipient);
    this.validation.assertItems(sale.items);

    const active = await this.prisma.saleDocument.findFirst({
      where: {
        saleId: sale.id,
        type: SaleDocumentType.nfe55,
        status: { not: SaleDocumentStatus.canceled },
        deletedAt: null,
      },
      include: DOCUMENT_INCLUDE,
    });
    if (active) {
      throw new ConflictException(
        'A venda ja possui uma NF-e ativa. Reabra o documento existente.',
      );
    }

    const payload = this.buildNormalizedPayload(sale, config!, dto);
    try {
      const document = await this.prisma.saleDocument.create({
        data: {
          saleId: sale.id,
          tenantId: context.tenantId,
          branchId: context.branchId!,
          orderId: sale.orderId,
          type: SaleDocumentType.nfe55,
          model: '55',
          environment: config!.environment,
          series: config!.nfeSeries,
          provider: config!.provider,
          idempotencyKey: dto.idempotencyKey,
          normalizedPayload: payload as Prisma.InputJsonValue,
          status: SaleDocumentStatus.draft,
          createdById: context.userId,
          updatedById: context.userId,
          items: {
            create: sale.items.map((item) => this.buildFiscalItem(item)),
          },
          events: {
            create: {
              eventType: 'draft_created',
              status: SaleDocumentStatus.draft,
              requestPayload: {
                saleId: sale.id,
                idempotencyKey: dto.idempotencyKey,
              },
              createdById: context.userId,
            },
          },
        },
        include: DOCUMENT_INCLUDE,
      });
      return {
        ok: true,
        idempotent: false,
        document: this.formatDocument(document),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const raced = await this.prisma.saleDocument.findFirst({
          where: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
            OR: [
              { idempotencyKey: dto.idempotencyKey },
              {
                saleId: sale.id,
                type: SaleDocumentType.nfe55,
                status: { not: SaleDocumentStatus.canceled },
              },
            ],
          },
          include: DOCUMENT_INCLUDE,
        });
        if (raced?.idempotencyKey === dto.idempotencyKey) {
          return {
            ok: true,
            idempotent: true,
            document: this.formatDocument(raced),
          };
        }
        throw new ConflictException('A venda ja possui uma NF-e ativa.');
      }
      throw error;
    }
  }

  async sendDocument(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: SendFiscalDocumentDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      WRITE_ROLES,
    );
    const document = await this.findScopedDocument(
      context.tenantId,
      context.branchId!,
      id,
    );
    if (document.status === SaleDocumentStatus.authorized) {
      return {
        ok: true,
        idempotent: true,
        document: this.formatDocument(document),
      };
    }
    if (document.status === SaleDocumentStatus.canceled || document.deletedAt) {
      throw new BadRequestException(
        'Documento cancelado ou removido nao pode ser enviado.',
      );
    }

    const config = await this.loadConfig(context.tenantId, context.branchId!);
    this.validation.assertSaleEligible(document.sale);
    this.validation.assertConfig(config, true);
    this.validation.assertItems(document.sale.items);
    const provider = this.getProvider(config!.provider);

    if (
      config!.environment === FiscalEnvironment.producao &&
      !provider.isRealProvider
    ) {
      throw new ServiceUnavailableException(
        'Emissao em producao exige provider fiscal real. O provider mock nunca autoriza documentos.',
      );
    }

    const number =
      document.number ??
      String(
        await this.sequence.allocate({
          tenantId: context.tenantId,
          branchId: context.branchId!,
          model: '55',
          series: document.series || config!.nfeSeries,
          environment: config!.environment,
        }),
      );
    const providerDocument = this.toProviderDocument(document, number);

    await this.prisma.saleDocument.update({
      where: { id: document.id },
      data: {
        number,
        series: document.series || config!.nfeSeries,
        status: SaleDocumentStatus.processing,
        sentAt: new Date(),
        updatedById: context.userId,
        errorMessage: null,
      },
    });

    const result = await provider.sendNfe55(providerDocument);
    const safeStatus =
      result.status === SaleDocumentStatus.authorized &&
      !provider.isRealProvider
        ? SaleDocumentStatus.rejected
        : result.status;
    const response = this.validation.sanitizeProviderPayload(result.response);
    let xmlPath: string | undefined;
    let pdfPath: string | undefined;

    if (provider.isRealProvider && result.xml) {
      xmlPath = await this.storage.uploadXml({
        tenantId: context.tenantId,
        branchId: context.branchId!,
        saleId: document.saleId,
        documentId: document.id,
        content: result.xml,
      });
    }
    if (provider.isRealProvider && result.pdf) {
      pdfPath = await this.storage.uploadPdf({
        tenantId: context.tenantId,
        branchId: context.branchId!,
        saleId: document.saleId,
        documentId: document.id,
        content: result.pdf,
      });
    }

    const updated = await this.prisma.saleDocument.update({
      where: { id: document.id },
      data: {
        status: safeStatus,
        provider: provider.name,
        providerRef: result.providerRef,
        providerResponse: response as Prisma.InputJsonValue,
        errorMessage:
          safeStatus === SaleDocumentStatus.authorized
            ? null
            : (result.errorMessage ??
              (provider.isRealProvider
                ? null
                : 'Provider real nao configurado; autorizacao SEFAZ nao ocorreu.')),
        accessKey:
          provider.isRealProvider &&
          safeStatus === SaleDocumentStatus.authorized
            ? result.accessKey
            : null,
        protocol:
          provider.isRealProvider &&
          safeStatus === SaleDocumentStatus.authorized
            ? result.protocol
            : null,
        issuedAt:
          safeStatus === SaleDocumentStatus.authorized ? new Date() : null,
        xmlPath,
        pdfPath,
        updatedById: context.userId,
        events: {
          create: {
            eventType: 'send',
            status: safeStatus,
            providerRef: result.providerRef,
            requestPayload: {
              requestId: dto.requestId,
              number,
              series: document.series || config!.nfeSeries,
            },
            responsePayload: response as Prisma.InputJsonValue,
            errorMessage: result.errorMessage,
            createdById: context.userId,
          },
        },
      },
      include: DOCUMENT_INCLUDE,
    });

    return {
      ok: true,
      authorized: safeStatus === SaleDocumentStatus.authorized,
      providerReal: provider.isRealProvider,
      message: provider.isRealProvider
        ? 'Retorno do provider fiscal processado.'
        : 'Documento mantido em processamento. Provider fiscal real nao configurado.',
      document: this.formatDocument(updated),
    };
  }

  async queryDocumentStatus(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const document = await this.findScopedDocument(
      context.tenantId,
      context.branchId!,
      id,
    );
    if (!document.number || !document.series) {
      return {
        ok: true,
        queried: false,
        message:
          'Documento ainda esta em rascunho e nao possui numeracao fiscal.',
        document: this.formatDocument(document),
      };
    }
    const provider = this.getProvider(document.provider || 'mock');
    const result = await provider.queryStatus(
      this.toProviderDocument(document, document.number),
    );
    const safeStatus =
      result.status === SaleDocumentStatus.authorized &&
      !provider.isRealProvider
        ? SaleDocumentStatus.rejected
        : result.status;
    const response = this.validation.sanitizeProviderPayload(result.response);
    const updated = await this.prisma.saleDocument.update({
      where: { id: document.id },
      data: {
        status: safeStatus,
        providerResponse: response as Prisma.InputJsonValue,
        errorMessage: result.errorMessage,
        events: {
          create: {
            eventType: 'status_query',
            status: safeStatus,
            providerRef: result.providerRef,
            responsePayload: response as Prisma.InputJsonValue,
            errorMessage: result.errorMessage,
            createdById: context.userId,
          },
        },
      },
      include: DOCUMENT_INCLUDE,
    });
    return {
      ok: true,
      queried: true,
      authorized: safeStatus === SaleDocumentStatus.authorized,
      document: this.formatDocument(updated),
    };
  }

  async cancelDocument(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: CancelFiscalDocumentDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      WRITE_ROLES,
    );
    const document = await this.findScopedDocument(
      context.tenantId,
      context.branchId!,
      id,
    );
    if (document.status !== SaleDocumentStatus.authorized) {
      throw new BadRequestException(
        'Somente documento autorizado pode ser cancelado no provider fiscal.',
      );
    }
    const provider = this.getProvider(document.provider || 'mock');
    if (!provider.isRealProvider) {
      throw new ServiceUnavailableException(
        'Cancelamento fiscal exige provider real e confirmacao da SEFAZ.',
      );
    }
    const result = await provider.cancel(
      this.toProviderDocument(document, document.number!),
      dto.cancellationReason,
    );
    if (result.status !== SaleDocumentStatus.canceled) {
      throw new BadRequestException(
        result.errorMessage || 'Provider nao confirmou o cancelamento fiscal.',
      );
    }
    const updated = await this.prisma.saleDocument.update({
      where: { id: document.id },
      data: {
        status: SaleDocumentStatus.canceled,
        canceledAt: new Date(),
        cancellationReason: dto.cancellationReason.trim(),
        updatedById: context.userId,
        events: {
          create: {
            eventType: 'cancel',
            status: SaleDocumentStatus.canceled,
            providerRef: result.providerRef,
            responsePayload: this.validation.sanitizeProviderPayload(
              result.response,
            ) as Prisma.InputJsonValue,
            createdById: context.userId,
          },
        },
      },
      include: DOCUMENT_INCLUDE,
    });
    return { ok: true, document: this.formatDocument(updated) };
  }

  async getFile(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    format: 'xml' | 'pdf',
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    const document = await this.findScopedDocument(
      context.tenantId,
      context.branchId!,
      id,
    );
    const storagePath = format === 'xml' ? document.xmlPath : document.pdfPath;
    if (!storagePath) {
      throw new NotFoundException(
        `${format.toUpperCase()} fiscal ainda nao esta disponivel.`,
      );
    }
    return {
      documentId: document.id,
      format,
      signedUrl: await this.storage.createSignedUrl(storagePath),
      expiresInSeconds: 3600,
    };
  }

  async getCompanyConfig(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      false,
    );
    return {
      config: this.formatConfig(
        await this.loadConfig(context.tenantId, context.branchId!),
      ),
    };
  }

  async updateCompanyConfig(
    user: Express.AuthenticatedUser | undefined,
    dto: CompanyFiscalConfigDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (dto.environment === FiscalEnvironment.producao) {
      throw new BadRequestException(
        'Ative producao somente pelo fluxo de confirmacao fiscal.',
      );
    }
    const context = await this.resolveContext(
      user,
      selectedBranchId,
      devContextMode,
      true,
      WRITE_ROLES,
    );
    const providerConfig = this.validation.sanitizeProviderPayload(
      dto.providerConfig,
    );
    const data = {
      legalName: dto.legalName.trim(),
      tradeName: clean(dto.tradeName),
      cnpj: this.validation.digits(dto.cnpj),
      stateRegistration: clean(dto.stateRegistration),
      municipalRegistration: clean(dto.municipalRegistration),
      crt: dto.crt,
      taxRegime: dto.taxRegime.trim(),
      street: dto.street.trim(),
      number: dto.number.trim(),
      complement: clean(dto.complement),
      district: dto.district.trim(),
      city: dto.city.trim(),
      cityCodeIbge: this.validation.digits(dto.cityCodeIbge),
      state: dto.state.trim().toUpperCase(),
      zipCode: this.validation.digits(dto.zipCode),
      country: clean(dto.country) || 'Brasil',
      ...(dto.environment ? { environment: dto.environment } : {}),
      nfeSeries: dto.nfeSeries.trim(),
      nfceSeries: dto.nfceSeries.trim(),
    };
    this.validation.assertConfig({
      ...data,
      certificateSecretRef: null,
      environment: dto.environment || FiscalEnvironment.homologacao,
      provider: clean(dto.provider) || 'mock',
    });

    const config = await this.prisma.companyFiscalConfig.upsert({
      where: {
        tenantId_branchId: {
          tenantId: context.tenantId,
          branchId: context.branchId!,
        },
      },
      create: {
        tenantId: context.tenantId,
        branchId: context.branchId!,
        ...data,
        provider: clean(dto.provider) || 'mock',
        providerConfig:
          Object.keys(providerConfig).length > 0
            ? (providerConfig as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
      update: {
        ...data,
        ...(dto.provider ? { provider: dto.provider.trim() } : {}),
        ...(dto.providerConfig
          ? {
              providerConfig:
                Object.keys(providerConfig).length > 0
                  ? (providerConfig as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            }
          : {}),
      },
    });
    return { ok: true, config: this.formatConfig(config) };
  }

  private async resolveContext(
    user: Express.AuthenticatedUser | undefined,
    selectedBranchId: string | undefined,
    devContextMode: string | undefined,
    writable: boolean,
    allowedRoles: Role[] = READ_ROLES,
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable,
      allowedRoles,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
  }

  private loadConfig(tenantId: string, branchId: string) {
    return this.prisma.companyFiscalConfig.findUnique({
      where: { tenantId_branchId: { tenantId, branchId } },
    });
  }

  private async findScopedSale(tenantId: string, branchId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId, branchId, deletedAt: null },
      include: SALE_FISCAL_INCLUDE,
    });
    if (!sale) {
      throw new NotFoundException('Venda nao encontrada.');
    }
    return sale;
  }

  private async findScopedDocument(
    tenantId: string,
    branchId: string,
    id: string,
  ) {
    const document = await this.prisma.saleDocument.findFirst({
      where: {
        id,
        tenantId,
        branchId,
        deletedAt: null,
        type: SaleDocumentType.nfe55,
      },
      include: DOCUMENT_INCLUDE,
    });
    if (!document) {
      throw new NotFoundException('Documento fiscal nao encontrado.');
    }
    return document;
  }

  private buildDraftFromSale(
    sale: FiscalSale,
    config: Awaited<ReturnType<FiscalService['loadConfig']>>,
  ) {
    return {
      source: 'sale',
      orderId: sale.orderId,
      saleId: sale.id,
      eligibleForEmission:
        sale.status === SaleStatus.paid &&
        !sale.order?.status.match(/canceled|refunded/),
      company: this.formatConfig(config),
      recipient: sale.order
        ? {
            name: sale.order.customerName,
            document: sale.order.customerDocument,
            email: sale.order.customerEmail,
            phone: sale.order.customerPhone,
          }
        : null,
      items: sale.items.map((item) => this.formatDraftItem(item)),
      payment: {
        method: sale.paymentMethod,
        payments: sale.payments.map((payment) => ({
          method: payment.paymentMethod,
          amountCents: payment.amountCents,
          status: payment.status,
        })),
      },
      totals: {
        subtotalCents: sale.subtotalCents,
        discountCents: sale.discountCents,
        freightCents: 0,
        totalCents: sale.totalCents,
      },
    };
  }

  private formatDraftItem(item: {
    id: string;
    productId: string | null;
    productNameSnapshot: string;
    skuSnapshot: string | null;
    barcodeSnapshot: string | null;
    ncmSnapshot?: string | null;
    cfopSnapshot?: string | null;
    unitSnapshot?: string | null;
    originSnapshot?: string | null;
    cestSnapshot?: string | null;
    quantity: number;
    unitPriceCents: number;
    totalPriceCents: number;
    product?: FiscalSale['items'][number]['product'];
  }) {
    return {
      saleItemId: item.id,
      productId: item.productId,
      description: item.productNameSnapshot,
      sku: item.skuSnapshot,
      barcode: item.barcodeSnapshot,
      ncm: item.ncmSnapshot || item.product?.ncm || '',
      cfop: item.cfopSnapshot || item.product?.cfopDefault || '',
      cest: item.cestSnapshot || item.product?.cest || '',
      origin: item.originSnapshot || item.product?.origin || '',
      unit: item.unitSnapshot || item.product?.unit || '',
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
      icmsRate: decimalNumber(item.product?.icmsRate),
      ipiRate: decimalNumber(item.product?.ipiRate),
      pisRate: decimalNumber(item.product?.pisRate),
      cofinsRate: decimalNumber(item.product?.cofinsRate),
    };
  }

  private buildNormalizedPayload(
    sale: FiscalSale,
    config: NonNullable<Awaited<ReturnType<FiscalService['loadConfig']>>>,
    dto: CreateNfe55DocumentDto,
  ) {
    const freightCents = dto.freightCents ?? 0;
    return {
      version: 1,
      model: '55',
      environment: config.environment,
      saleId: sale.id,
      orderId: sale.orderId,
      operationNature: clean(dto.operationNature) || 'Venda de mercadoria',
      buyerPresence: dto.buyerPresence || '0',
      finalConsumer: dto.finalConsumer || '1',
      issuer: {
        legalName: config.legalName,
        tradeName: config.tradeName,
        cnpj: config.cnpj,
        stateRegistration: config.stateRegistration,
        crt: config.crt,
        taxRegime: config.taxRegime,
        street: config.street,
        number: config.number,
        complement: config.complement,
        district: config.district,
        city: config.city,
        cityCodeIbge: config.cityCodeIbge,
        state: config.state,
        zipCode: config.zipCode,
        country: config.country,
      },
      recipient: {
        ...dto.recipient,
        document: this.validation.digits(dto.recipient.document),
        state: dto.recipient.state.toUpperCase(),
        zipCode: this.validation.digits(dto.recipient.zipCode),
        cityCodeIbge: this.validation.digits(dto.recipient.cityCodeIbge),
      },
      items: sale.items.map((item) => this.formatDraftItem(item)),
      totals: {
        productsCents: sale.subtotalCents,
        discountCents: sale.discountCents,
        freightCents,
        totalCents: sale.subtotalCents - sale.discountCents + freightCents,
      },
      payment: {
        method: sale.paymentMethod,
        totalCents: sale.totalCents,
      },
      additionalInformation: clean(dto.additionalInformation),
    };
  }

  private buildFiscalItem(item: FiscalSale['items'][number]) {
    const draft = this.formatDraftItem(item);
    return {
      saleItemId: item.id,
      productId: item.productId,
      description: draft.description,
      sku: draft.sku,
      barcode: draft.barcode,
      ncm: this.validation.digits(draft.ncm),
      cfop: this.validation.digits(draft.cfop),
      cest: clean(draft.cest),
      origin: draft.origin,
      unit: draft.unit,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      totalPriceCents: item.totalPriceCents,
      discountCents: 0,
      icmsRate: item.product?.icmsRate,
      ipiRate: item.product?.ipiRate,
      pisRate: item.product?.pisRate,
      cofinsRate: item.product?.cofinsRate,
    };
  }

  private getProvider(name: string): FiscalProvider {
    if (!name || name.toLowerCase() === 'mock') {
      return this.mockProvider;
    }
    throw new ServiceUnavailableException(
      `Provider fiscal "${name}" ainda nao possui adapter configurado.`,
    );
  }

  private toProviderDocument(
    document: FiscalDocumentWithRelations,
    number: string,
  ): FiscalProviderDocument {
    return {
      documentId: document.id,
      model: document.model || '55',
      environment: document.environment || FiscalEnvironment.homologacao,
      tpAmb:
        (document.environment || FiscalEnvironment.homologacao) ===
        FiscalEnvironment.producao
          ? 1
          : 2,
      series: document.series || '1',
      number,
      payload:
        document.normalizedPayload &&
        typeof document.normalizedPayload === 'object' &&
        !Array.isArray(document.normalizedPayload)
          ? (document.normalizedPayload as Record<string, unknown>)
          : {},
    };
  }

  private formatDocument(document: FiscalDocumentWithRelations) {
    return {
      id: document.id,
      saleId: document.saleId,
      orderId: document.orderId,
      type: document.type,
      model: document.model,
      environment: document.environment,
      number: document.number,
      series: document.series,
      accessKey: document.accessKey,
      protocol: document.protocol,
      provider: document.provider,
      providerRef: document.providerRef,
      status: document.status,
      errorMessage: document.errorMessage,
      issuedAt: document.issuedAt,
      sentAt: document.sentAt,
      canceledAt: document.canceledAt,
      cancellationReason: document.cancellationReason,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
      hasXml: Boolean(document.xmlPath),
      hasPdf: Boolean(document.pdfPath),
      payload: document.normalizedPayload,
      items: document.items,
      events: document.events.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        status: event.status,
        providerRef: event.providerRef,
        errorMessage: event.errorMessage,
        createdAt: event.createdAt,
      })),
    };
  }

  private formatConfig(
    config: Awaited<ReturnType<FiscalService['loadConfig']>>,
  ) {
    if (!config) return null;
    return {
      id: config.id,
      legalName: config.legalName,
      tradeName: config.tradeName,
      cnpj: config.cnpj,
      stateRegistration: config.stateRegistration,
      municipalRegistration: config.municipalRegistration,
      crt: config.crt,
      taxRegime: config.taxRegime,
      street: config.street,
      number: config.number,
      complement: config.complement,
      district: config.district,
      city: config.city,
      cityCodeIbge: config.cityCodeIbge,
      state: config.state,
      zipCode: config.zipCode,
      country: config.country,
      environment: config.environment,
      nfeSeries: config.nfeSeries,
      nfceSeries: config.nfceSeries,
      provider: config.provider,
      hasCertificate: Boolean(
        config.certificateSecretRef || config.certificatePath,
      ),
      certificateExpiresAt: config.certificateExpiresAt,
      certificate: config.certificatePath
        ? {
            present: true,
            status: config.certificateValidationStatus || 'pending',
            originalName: config.certificateOriginalName,
            mimeType: config.certificateMimeType,
            size: config.certificateSize,
            uploadedAt: config.certificateUploadedAt,
            validFrom: config.certificateValidFrom,
            expiresAt: config.certificateExpiresAt,
            subject: config.certificateSubject,
            issuer: config.certificateIssuer,
            serialNumber: config.certificateSerialNumber,
            cnpj: config.certificateCnpj,
            fingerprintSha256: config.certificateFingerprintSha256,
            validatedAt: config.certificateValidatedAt,
            validationErrorCode: config.certificateValidationErrorCode,
          }
        : { present: false, status: 'absent' },
      productionEnabledAt: config.productionEnabledAt,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };
  }
}

function clean(value?: string | null) {
  const result = value?.trim();
  return result || null;
}

function decimalNumber(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
