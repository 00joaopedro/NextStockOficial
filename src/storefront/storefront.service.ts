/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unnecessary-type-assertion */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AuditOutcome,
  AuditSeverity,
  FulfillmentType,
  OrderPaymentMethod,
  OrderSource,
  OrderStatus,
  Prisma,
  Role,
  StorefrontStatus,
} from '@prisma/client';
import { createHash, createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { BillingEntitlementService } from '../billing/billing-entitlement.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateGuestOrderDto,
  PublicProductsQueryDto,
} from './dto/storefront-public.dto';
import {
  UpdateStorefrontProductDto,
  UpsertStorefrontDto,
} from './dto/storefront-admin.dto';
import { assertPublicSlug, normalizePublicSlug } from './storefront-slug';

type RequestMeta = { ip?: string; userAgent?: string; requestId?: string };
const PUBLIC_NOT_FOUND = 'Loja nao encontrada.';
const ACTIVE_ORDER_STATUSES = [
  OrderStatus.pending,
  OrderStatus.preparing,
  OrderStatus.paid,
];

@Injectable()
export class StorefrontService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly billing: BillingEntitlementService,
    private readonly storage: SupabaseStorageService,
    private readonly audit: AuditService,
  ) {}

  async getAdmin(user: AuthenticatedUser | undefined, branchId?: string) {
    const context = await this.adminContext(user, branchId, false);
    const storefront = await this.prisma.storefront.findUnique({
      where: { branchId: context.branchId! },
    });
    return { ok: true, storefront };
  }

  async upsertAdmin(
    user: AuthenticatedUser | undefined,
    dto: UpsertStorefrontDto,
    selectedBranchId?: string,
  ) {
    const context = await this.adminContext(user, selectedBranchId, true);
    if (dto.branchId !== context.branchId)
      throw new ForbiddenException('A filial deve ser a filial autenticada.');
    const slug = normalizePublicSlug(dto.publicSlug);
    if (!assertPublicSlug(slug))
      throw new BadRequestException('Slug publico invalido ou reservado.');
    if (!dto.pickupEnabled && !dto.deliveryEnabled)
      throw new BadRequestException('Habilite retirada ou entrega.');
    if (dto.status === StorefrontStatus.active && !dto.orderingEnabled)
      throw new BadRequestException('Uma vitrine ativa deve aceitar pedidos.');
    const existing = await this.prisma.storefront.findUnique({
      where: { branchId: context.branchId! },
    });
    try {
      const storefront = await this.prisma.$transaction(async (tx) => {
        if (existing && existing.publicSlug !== slug) {
          await tx.storefrontSlugRedirect.upsert({
            where: { oldSlug: existing.publicSlug },
            create: {
              storefrontId: existing.id,
              oldSlug: existing.publicSlug,
              expiresAt: new Date(Date.now() + 180 * 86400000),
            },
            update: {
              storefrontId: existing.id,
              expiresAt: new Date(Date.now() + 180 * 86400000),
            },
          });
        }
        return tx.storefront.upsert({
          where: { branchId: context.branchId! },
          create: {
            tenantId: context.tenantId,
            branchId: context.branchId!,
            publicSlug: slug,
            publicName: dto.publicName.trim(),
            publicDescription: clean(dto.publicDescription),
            status: dto.status,
            orderingEnabled: dto.orderingEnabled,
            pickupEnabled: dto.pickupEnabled,
            deliveryEnabled: dto.deliveryEnabled,
            publishedAt:
              dto.status === StorefrontStatus.active ? new Date() : null,
          },
          update: {
            publicSlug: slug,
            publicName: dto.publicName.trim(),
            publicDescription: clean(dto.publicDescription),
            status: dto.status,
            orderingEnabled: dto.orderingEnabled,
            pickupEnabled: dto.pickupEnabled,
            deliveryEnabled: dto.deliveryEnabled,
            publishedAt:
              dto.status === StorefrontStatus.active
                ? (existing?.publishedAt ?? new Date())
                : null,
          },
        });
      });
      return { ok: true, storefront };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Slug publico ja esta em uso.');
      throw error;
    }
  }

  async listAdminProducts(
    user: AuthenticatedUser | undefined,
    selectedBranchId?: string,
  ) {
    const context = await this.adminContext(user, selectedBranchId, false);
    const storefront = await this.prisma.storefront.findUnique({
      where: { branchId: context.branchId! },
    });
    if (!storefront)
      throw new NotFoundException('Configure a vitrine desta filial primeiro.');
    const products = await this.prisma.product.findMany({
      where: { tenantId: context.tenantId, branchId: context.branchId! },
      select: {
        id: true,
        name: true,
        salePriceCents: true,
        quantity: true,
        unit: true,
        category: true,
        storefrontListings: { where: { storefrontId: storefront.id } },
      },
      orderBy: { name: 'asc' },
      take: 500,
    });
    return { ok: true, products };
  }

  async updateAdminProduct(
    user: AuthenticatedUser | undefined,
    dto: UpdateStorefrontProductDto,
    selectedBranchId?: string,
  ) {
    const context = await this.adminContext(user, selectedBranchId, true);
    const storefront = await this.prisma.storefront.findUnique({
      where: { branchId: context.branchId! },
    });
    if (!storefront)
      throw new NotFoundException('Configure a vitrine desta filial primeiro.');
    const product = await this.prisma.product.findFirst({
      where: {
        id: dto.productId,
        tenantId: context.tenantId,
        branchId: context.branchId!,
      },
      select: { id: true, unit: true },
    });
    if (!product)
      throw new NotFoundException('Produto nao encontrado nesta filial.');
    const slug = normalizePublicSlug(dto.publicSlug);
    if (!assertPublicSlug(slug))
      throw new BadRequestException('Slug de produto invalido ou reservado.');
    if (
      dto.maximumOrderQuantity &&
      dto.maximumOrderQuantity < dto.minimumOrderQuantity
    )
      throw new BadRequestException(
        'Quantidade maxima deve ser maior ou igual a minima.',
      );
    if (isFractionalUnit(product.unit) && dto.isPublished)
      throw new BadRequestException(
        'Produtos fracionados ainda nao podem ser publicados com seguranca.',
      );
    try {
      const listing = await this.prisma.storefrontProduct.upsert({
        where: {
          storefrontId_productId: {
            storefrontId: storefront.id,
            productId: product.id,
          },
        },
        create: {
          storefrontId: storefront.id,
          productId: product.id,
          publicSlug: slug,
          isPublished: dto.isPublished,
          availableForOnlineOrder: dto.availableForOnlineOrder,
          publicName: clean(dto.publicName),
          publicDescription: clean(dto.publicDescription),
          sortOrder: dto.sortOrder,
          minimumOrderQuantity: dto.minimumOrderQuantity,
          maximumOrderQuantity: dto.maximumOrderQuantity,
        },
        update: {
          publicSlug: slug,
          isPublished: dto.isPublished,
          availableForOnlineOrder: dto.availableForOnlineOrder,
          publicName: clean(dto.publicName),
          publicDescription: clean(dto.publicDescription),
          sortOrder: dto.sortOrder,
          minimumOrderQuantity: dto.minimumOrderQuantity,
          maximumOrderQuantity: dto.maximumOrderQuantity,
        },
      });
      return { ok: true, listing };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Slug de produto ja esta em uso nesta vitrine.',
        );
      throw error;
    }
  }

  async getPublic(slug: string) {
    const storefront = await this.resolvePublic(slug);
    return { store: this.publicStore(storefront) };
  }

  async listPublicProducts(slug: string, query: PublicProductsQueryDto) {
    const storefront = await this.resolvePublic(slug);
    const limit = query.limit ?? 20;
    const cursor = decodeCursor(query.cursor);
    const listings = await this.prisma.storefrontProduct.findMany({
      where: {
        storefrontId: storefront.id,
        isPublished: true,
        product: {
          tenantId: storefront.tenantId,
          branchId: storefront.branchId,
          ...(query.q
            ? { name: { contains: query.q.trim(), mode: 'insensitive' } }
            : {}),
          ...(query.category
            ? {
                category: {
                  equals: query.category.trim(),
                  mode: 'insensitive',
                },
              }
            : {}),
        },
      },
      select: {
        id: true,
        publicSlug: true,
        publicName: true,
        publicDescription: true,
        availableForOnlineOrder: true,
        minimumOrderQuantity: true,
        maximumOrderQuantity: true,
        product: {
          select: {
            name: true,
            description: true,
            salePriceCents: true,
            quantity: true,
            category: true,
            unit: true,
            images: {
              orderBy: { createdAt: 'asc' },
              take: 1,
              select: {
                thumbnailPath: true,
                mediumPath: true,
                storagePath: true,
              },
            },
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: limit + 1,
    });
    const page = listings.slice(0, limit);
    return {
      store: this.publicStore(storefront),
      products: await Promise.all(page.map((item) => this.publicProduct(item))),
      nextCursor:
        listings.length > limit ? encodeCursor(page.at(-1)!.id) : null,
    };
  }

  async getPublicProduct(slug: string, productSlug: string) {
    const storefront = await this.resolvePublic(slug);
    const item = await this.prisma.storefrontProduct.findFirst({
      where: {
        storefrontId: storefront.id,
        publicSlug: productSlug,
        isPublished: true,
        product: {
          tenantId: storefront.tenantId,
          branchId: storefront.branchId,
        },
      },
      select: {
        id: true,
        publicSlug: true,
        publicName: true,
        publicDescription: true,
        availableForOnlineOrder: true,
        minimumOrderQuantity: true,
        maximumOrderQuantity: true,
        product: {
          select: {
            name: true,
            description: true,
            salePriceCents: true,
            quantity: true,
            category: true,
            unit: true,
            images: {
              orderBy: { createdAt: 'asc' },
              take: 3,
              select: {
                mediumPath: true,
                storagePath: true,
                thumbnailPath: true,
              },
            },
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Produto nao encontrado.');
    return { product: await this.publicProduct(item) };
  }

  async createGuestOrder(
    slug: string,
    idempotencyKey: string | undefined,
    dto: CreateGuestOrderDto,
    meta: RequestMeta,
  ) {
    if (
      !process.env.STOREFRONT_ORDERING_ENABLED ||
      process.env.STOREFRONT_ORDERING_ENABLED !== 'true'
    )
      throw new ServiceUnavailableException(
        'Pedidos online estao temporariamente indisponiveis.',
      );
    if (!idempotencyKey || !/^[A-Za-z0-9._~-]{16,128}$/.test(idempotencyKey))
      throw new BadRequestException('Idempotency-Key invalida ou ausente.');
    const storefront = await this.resolvePublic(slug, true);
    await this.expireReservations(storefront.id);
    if (
      dto.fulfillmentType === FulfillmentType.pickup &&
      !storefront.pickupEnabled
    )
      throw new BadRequestException('Retirada indisponivel.');
    if (
      dto.fulfillmentType === FulfillmentType.delivery &&
      !storefront.deliveryEnabled
    )
      throw new BadRequestException('Entrega indisponivel.');
    const phone = normalizePhone(dto.customerPhone);
    if (phone.length < 8) throw new BadRequestException('Telefone invalido.');
    const normalizedItems = aggregateItems(dto.items);
    const keyHash = this.hashSecret(`${storefront.id}|${idempotencyKey}`);
    const requestHash = createHash('sha256')
      .update(
        stableJson({ ...dto, customerPhone: phone, items: normalizedItems }),
      )
      .digest('hex');
    const existing = await this.prisma.order.findFirst({
      where: { storefrontId: storefront.id, idempotencyKeyHash: keyHash },
      include: { items: true },
    });
    if (existing) {
      if (existing.idempotencyRequestHash !== requestHash)
        throw new ConflictException(
          'A chave de idempotencia ja foi usada com outro pedido.',
        );
      return this.guestOrderResponse(
        existing,
        this.trackingToken(storefront.id, idempotencyKey),
      );
    }
    const activeCount = await this.prisma.order.count({
      where: {
        storefrontId: storefront.id,
        customerPhone: phone,
        source: OrderSource.storefront_guest,
        status: { in: ACTIVE_ORDER_STATUSES },
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        deletedAt: null,
      },
    });
    if (activeCount >= 3)
      throw new ConflictException(
        'Limite de 3 pedidos ativos atingido para este telefone.',
      );
    const trackingToken = this.trackingToken(storefront.id, idempotencyKey);
    try {
      const order = await this.prisma.$transaction(
        async (tx) => {
          const listings = await tx.storefrontProduct.findMany({
            where: {
              storefrontId: storefront.id,
              publicSlug: { in: normalizedItems.map((i) => i.productSlug) },
              isPublished: true,
              availableForOnlineOrder: true,
              product: {
                tenantId: storefront.tenantId,
                branchId: storefront.branchId,
              },
            },
            select: {
              publicSlug: true,
              publicName: true,
              minimumOrderQuantity: true,
              maximumOrderQuantity: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  barcode: true,
                  salePriceCents: true,
                  quantity: true,
                },
              },
            },
          });
          if (listings.length !== normalizedItems.length)
            throw new ConflictException(
              'Um ou mais produtos nao estao disponiveis.',
            );
          const bySlug = new Map(listings.map((i) => [i.publicSlug, i]));
          const priced = normalizedItems.map((requested) => {
            const listing = bySlug.get(requested.productSlug)!;
            if (
              requested.quantity < listing.minimumOrderQuantity ||
              (listing.maximumOrderQuantity &&
                requested.quantity > listing.maximumOrderQuantity)
            )
              throw new BadRequestException(
                'Quantidade fora dos limites permitidos.',
              );
            return {
              productId: listing.product.id,
              productNameSnapshot: listing.publicName ?? listing.product.name,
              skuSnapshot: listing.product.sku,
              barcodeSnapshot: listing.product.barcode,
              quantity: requested.quantity,
              unitPriceCents: listing.product.salePriceCents,
              totalPriceCents:
                listing.product.salePriceCents * requested.quantity,
            };
          });
          for (const item of priced) {
            const changed = await tx.product.updateMany({
              where: {
                id: item.productId,
                tenantId: storefront.tenantId,
                branchId: storefront.branchId,
                quantity: { gte: item.quantity },
              },
              data: { quantity: { decrement: item.quantity } },
            });
            if (changed.count !== 1)
              throw new ConflictException(
                'Estoque alterado. Atualize o carrinho e tente novamente.',
              );
          }
          const subtotalCents = priced.reduce(
            (sum, item) => sum + item.totalPriceCents,
            0,
          );
          return tx.order.create({
            data: {
              tenantId: storefront.tenantId,
              branchId: storefront.branchId,
              storefrontId: storefront.id,
              source: OrderSource.storefront_guest,
              publicReference: `NS-${randomBytes(8).toString('hex').toUpperCase()}`,
              publicAccessTokenHash: this.hashSecret(trackingToken),
              idempotencyKeyHash: keyHash,
              idempotencyRequestHash: requestHash,
              customerName: dto.customerName.trim(),
              customerPhone: phone,
              customerEmail: clean(dto.customerEmail)?.toLowerCase(),
              paymentMethod: OrderPaymentMethod.other,
              status: OrderStatus.pending,
              subtotalCents,
              totalCents: subtotalCents,
              discountCents: 0,
              notes: clean(dto.notes),
              fulfillmentType: dto.fulfillmentType,
              deliveryAddress:
                dto.fulfillmentType === FulfillmentType.delivery
                  ? (dto.deliveryAddress as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
              reservationExpiresAt: new Date(Date.now() + 30 * 86400000),
              items: { create: priced },
            },
            include: { items: true },
          });
        },
        { timeout: 10000 },
      );
      void this.audit.record({
        eventType: 'storefront.order_created',
        action: 'create_guest_order',
        outcome: AuditOutcome.SUCCESS,
        severity: AuditSeverity.LOW,
        tenantId: storefront.tenantId,
        branchId: storefront.branchId,
        targetType: 'order',
        targetId: order.id,
        requestId: meta.requestId,
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { itemCount: order.items.length },
      });
      return this.guestOrderResponse(order, trackingToken);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const replay = await this.prisma.order.findFirst({
          where: { storefrontId: storefront.id, idempotencyKeyHash: keyHash },
          include: { items: true },
        });
        if (replay && replay.idempotencyRequestHash === requestHash)
          return this.guestOrderResponse(replay, trackingToken);
      }
      throw error;
    }
  }

  async listGuestOrders(slug: string, phoneInput: string, token: string) {
    const storefront = await this.resolvePublic(slug);
    this.assertTrackingToken(token);
    await this.expireReservations(storefront.id);
    const phone = normalizePhone(phoneInput);
    const authorized = await this.prisma.order.findFirst({
      where: {
        storefrontId: storefront.id,
        customerPhone: phone,
        publicAccessTokenHash: this.hashSecret(token),
        source: OrderSource.storefront_guest,
      },
      select: { id: true },
    });
    if (!authorized) throw new NotFoundException('Pedido nao encontrado.');
    const orders = await this.prisma.order.findMany({
      where: {
        storefrontId: storefront.id,
        customerPhone: phone,
        source: OrderSource.storefront_guest,
        createdAt: { gte: new Date(Date.now() - 30 * 86400000) },
        deletedAt: null,
      },
      select: {
        publicReference: true,
        status: true,
        subtotalCents: true,
        totalCents: true,
        fulfillmentType: true,
        createdAt: true,
        reservationExpiresAt: true,
        items: {
          select: {
            productNameSnapshot: true,
            quantity: true,
            unitPriceCents: true,
            totalPriceCents: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });
    return { orders };
  }

  async cancelGuestOrder(
    slug: string,
    reference: string,
    token: string,
    meta: RequestMeta,
  ) {
    const storefront = await this.resolvePublic(slug);
    this.assertTrackingToken(token);
    const order = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.order.findFirst({
        where: {
          storefrontId: storefront.id,
          publicReference: reference,
          publicAccessTokenHash: this.hashSecret(token),
          source: OrderSource.storefront_guest,
          deletedAt: null,
        },
        include: { items: true },
      });
      if (!existing) throw new NotFoundException('Pedido nao encontrado.');
      if (existing.status === OrderStatus.canceled) return existing;
      if (
        existing.status !== OrderStatus.pending &&
        existing.status !== OrderStatus.preparing
      )
        throw new ConflictException(
          'Este pedido nao pode mais ser cancelado pelo cliente.',
        );
      const changed = await tx.order.updateMany({
        where: {
          id: existing.id,
          status: { in: [OrderStatus.pending, OrderStatus.preparing] },
          stockRestoredAt: null,
        },
        data: {
          status: OrderStatus.canceled,
          canceledAt: new Date(),
          cancellationReason: 'Cancelado pelo cliente',
          stockRestoredAt: new Date(),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'O pedido foi atualizado. Recarregue a lista.',
        );
      for (const item of existing.items)
        await tx.product.updateMany({
          where: {
            id: item.productId,
            tenantId: storefront.tenantId,
            branchId: storefront.branchId,
          },
          data: { quantity: { increment: item.quantity } },
        });
      return tx.order.findUniqueOrThrow({
        where: { id: existing.id },
        include: { items: true },
      });
    });
    void this.audit.record({
      eventType: 'storefront.order_canceled',
      action: 'cancel_guest_order',
      outcome: AuditOutcome.SUCCESS,
      severity: AuditSeverity.LOW,
      tenantId: storefront.tenantId,
      branchId: storefront.branchId,
      targetType: 'order',
      targetId: order.id,
      requestId: meta.requestId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, reference: order.publicReference, status: order.status };
  }

  private async resolvePublic(slugInput: string, requireOrdering = false) {
    if (process.env.STOREFRONT_PUBLIC_READ_ENABLED !== 'true')
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    const slug = normalizePublicSlug(slugInput);
    let storefront = await this.prisma.storefront.findUnique({
      where: { publicSlug: slug },
      include: { branch: { select: { isActive: true } } },
    });
    if (!storefront) {
      const redirect = await this.prisma.storefrontSlugRedirect.findUnique({
        where: { oldSlug: slug },
        include: {
          storefront: { include: { branch: { select: { isActive: true } } } },
        },
      });
      if (redirect && (!redirect.expiresAt || redirect.expiresAt > new Date()))
        storefront = redirect.storefront;
    }
    if (
      !storefront ||
      storefront.status !== StorefrontStatus.active ||
      !storefront.branch.isActive
    )
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    const entitlement = await this.billing.forTenant(storefront.tenantId);
    // A public storefront is a paid/trial entitlement even while the legacy
    // administrative billing rollout is permissive.
    if (!entitlement.allowed || !entitlement.subscription)
      throw new NotFoundException(PUBLIC_NOT_FOUND);
    if (requireOrdering && !storefront.orderingEnabled)
      throw new ServiceUnavailableException('Pedidos online estao pausados.');
    return storefront;
  }

  private async adminContext(
    user: AuthenticatedUser | undefined,
    branchId: string | undefined,
    writable: boolean,
  ) {
    return this.tenantContext.resolve(user, {
      selectedBranchId: branchId,
      requireBranch: true,
      writable,
      allowedRoles: [Role.Admin],
    });
  }
  private publicStore(storefront: any) {
    return {
      slug: storefront.publicSlug,
      name: storefront.publicName,
      description: storefront.publicDescription,
      orderingEnabled: storefront.orderingEnabled,
      fulfillmentOptions: [
        storefront.pickupEnabled ? 'pickup' : null,
        storefront.deliveryEnabled ? 'delivery' : null,
      ].filter(Boolean),
    };
  }
  private async publicProduct(item: any) {
    const images = await Promise.all(
      item.product.images.map(async (image: any) =>
        this.storage.getProductImageUrl(
          image.thumbnailPath ?? image.mediumPath ?? image.storagePath,
        ),
      ),
    );
    return {
      slug: item.publicSlug,
      name: item.publicName ?? item.product.name,
      description: item.publicDescription ?? item.product.description,
      priceCents: item.product.salePriceCents,
      currency: 'BRL',
      category: item.product.category,
      unit: item.product.unit || 'UN',
      available:
        item.availableForOnlineOrder &&
        item.product.quantity >= item.minimumOrderQuantity,
      minimumOrderQuantity: item.minimumOrderQuantity,
      maximumOrderQuantity: item.maximumOrderQuantity,
      images: images.filter(Boolean),
    };
  }
  private hashSecret(value: string) {
    return createHmac(
      'sha256',
      process.env.STOREFRONT_TOKEN_SECRET ||
        process.env.AUDIT_HASH_SECRET ||
        'development-only-storefront-secret',
    )
      .update(value)
      .digest('hex');
  }
  private trackingToken(storefrontId: string, idempotencyKey: string) {
    return createHmac(
      'sha256',
      process.env.STOREFRONT_TOKEN_SECRET ||
        process.env.AUDIT_HASH_SECRET ||
        'development-only-storefront-secret',
    )
      .update(`track|${storefrontId}|${idempotencyKey}`)
      .digest('base64url');
  }
  private assertTrackingToken(token: string) {
    if (!token || token.length < 32)
      throw new NotFoundException('Pedido nao encontrado.');
    // The token is storefront-scoped. Exact per-order authorization is checked by reference on cancellation.
    if (!/^[A-Za-z0-9_-]+$/.test(token))
      throw new NotFoundException('Pedido nao encontrado.');
  }
  private guestOrderResponse(order: any, trackingToken: string) {
    return {
      order: {
        reference: order.publicReference,
        status: 'confirmed',
        fulfillmentType: order.fulfillmentType,
        subtotalCents: order.subtotalCents,
        totalCents: order.totalCents,
        currency: 'BRL',
        createdAt: order.createdAt,
        reservationExpiresAt: order.reservationExpiresAt,
        trackingToken,
      },
    };
  }
  private async expireReservations(storefrontId: string) {
    const expired = await this.prisma.order.findMany({
      where: {
        storefrontId,
        source: OrderSource.storefront_guest,
        status: OrderStatus.pending,
        reservationExpiresAt: { lte: new Date() },
        stockRestoredAt: null,
      },
      select: { id: true },
      take: 10,
    });
    for (const candidate of expired)
      await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findFirst({
          where: {
            id: candidate.id,
            status: OrderStatus.pending,
            stockRestoredAt: null,
          },
          include: { items: true },
        });
        if (!order) return;
        const changed = await tx.order.updateMany({
          where: {
            id: order.id,
            status: OrderStatus.pending,
            stockRestoredAt: null,
          },
          data: {
            status: OrderStatus.canceled,
            canceledAt: new Date(),
            cancellationReason: 'Reserva expirada',
            stockRestoredAt: new Date(),
          },
        });
        if (changed.count !== 1) return;
        for (const item of order.items)
          await tx.product.updateMany({
            where: {
              id: item.productId,
              tenantId: order.tenantId,
              branchId: order.branchId,
            },
            data: { quantity: { increment: item.quantity } },
          });
      });
  }
}

function clean(value?: string | null) {
  return value?.trim() || null;
}
function normalizePhone(value: string) {
  return value.replace(/\D/g, '').slice(0, 20);
}
function isFractionalUnit(unit?: string | null) {
  return ['KG', 'KGM', 'G', 'GR', 'L', 'LT', 'ML'].includes(
    unit?.trim().toUpperCase() || '',
  );
}
function aggregateItems(
  items: Array<{ productSlug: string; quantity: number }>,
) {
  const values = new Map<string, number>();
  for (const item of items)
    values.set(
      item.productSlug,
      (values.get(item.productSlug) || 0) + item.quantity,
    );
  return [...values]
    .map(([productSlug, quantity]) => ({ productSlug, quantity }))
    .sort((a, b) => a.productSlug.localeCompare(b.productSlug));
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function encodeCursor(id: string) {
  return Buffer.from(id).toString('base64url');
}
function decodeCursor(cursor?: string) {
  if (!cursor) return undefined;
  try {
    const value = Buffer.from(cursor, 'base64url').toString('utf8');
    return /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
