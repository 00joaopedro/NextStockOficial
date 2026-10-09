import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  Prisma,
  Product,
  ProductImage,
  Role,
  SystemMode,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SupabaseStorageService } from '../storage/supabase-storage.service';
import { DevWorkspaceService } from '../tenancy/dev-workspace.service';
import { TenantContextService } from '../tenancy/tenant-context.service';
import { UsageService } from '../usage/usage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImagesDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductLookupQueryDto } from './dto/product-lookup-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { extractScanCodeCandidates, normalizeScanCode } from './scan-code.util';
import {
  parseScaleBarcode,
  type ScaleBarcodeConfig,
  type ParsedScaleLabel,
} from './scale-barcode.util';
import { decimalStockValue, normalizeQuantity } from './quantity.util';

const PREVIEW_BLOCKED_MESSAGE = 'Modo visualizacao: alteracao bloqueada.';
const SESSION_EXPIRED_MESSAGE = 'Sessao expirada. Faca login novamente.';
const MISSING_TENANT_MESSAGE = 'Usuario sem tenant/empresa vinculado.';
const MISSING_BRANCH_MESSAGE = 'Usuario sem filial selecionada.';
const TENANT_NOT_FOUND_MESSAGE = 'Tenant/empresa nao encontrado.';
const BRANCH_NOT_FOUND_MESSAGE =
  'Filial nao encontrada para o tenant selecionado.';

const DEMO_PRODUCTS = [
  {
    id: 'demo-camisa-polo-azul',
    nome: 'Camisa Polo Azul',
    precoCusto: '45.00',
    percentualLucro: '30',
    precoVenda: '58.50',
    quantidade: '10',
    marca: 'NextWear',
    categoria: 'Roupas',
    fornecedor: 'Fornecedor Azul',
    sku: 'CAM-001',
    codigoBarra: '7891111111111',
    descricao: 'Camisa polo masculina azul',
    peso: '300 g',
    altura: '5 cm',
    largura: '20 cm',
    linkExterno: '',
    tamanhoRoupa: 'M',
    tamanhoVestimenta: '40',
    imagens: ['camisa-polo-azul.jpg', 'camisa-polo-detalhe.jpg'],
  },
  {
    id: 'demo-tenis-esportivo-preto',
    nome: 'Tenis Esportivo Preto',
    precoCusto: '120.00',
    percentualLucro: '25',
    precoVenda: '150.00',
    quantidade: '6',
    marca: 'MoveFit',
    categoria: 'Calcados',
    fornecedor: 'Fornecedor Running',
    sku: 'TEN-010',
    codigoBarra: '7892222222222',
    descricao: 'Tenis esportivo leve',
    peso: '800 g',
    altura: '14 cm',
    largura: '28 cm',
    linkExterno: '',
    tamanhoRoupa: 'GG',
    tamanhoVestimenta: '42',
    imagens: ['tenis-preto.jpg'],
  },
];

type ProductWithImages = Product & { images: ProductImage[] };
type UploadFile = {
  originalname?: string;
  mimetype?: string;
  size?: number;
  buffer?: Buffer;
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly usageService?: UsageService,
    @Optional() private readonly tenantContext?: TenantContextService,
    @Optional() private readonly storage?: SupabaseStorageService,
  ) {}

  async findAll(
    user: AuthenticatedUser | undefined,
    query: ProductQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.getReadableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );

    if (!tenant) {
      return {
        ok: true,
        mode: SystemMode.visualizacao,
        products: this.filterDemoProducts(query),
      };
    }

    const where: Prisma.ProductWhereInput = {
      tenantId: tenant.id,
      branchId: tenant.branchId,
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.sku) {
      where.sku = query.sku.trim();
    }

    if (query.barcode) {
      where.barcode = query.barcode.trim();
    }

    if (query.category) {
      where.category = { contains: query.category.trim(), mode: 'insensitive' };
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? query.pageSize ?? 20, 50);
    const [total, products] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        select: {
          id: true,
          name: true,
          salePriceCents: true,
          quantity: true,
          quantityDecimal: true,
          isWeighable: true,
          unit: true,
          category: true,
          sku: true,
          barcode: true,
          images: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              fileName: true,
              fileUrl: true,
              storagePath: true,
              mediumUrl: true,
              mediumPath: true,
              thumbnailUrl: true,
              thumbnailPath: true,
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    // Resolve all product image URLs in one Storage request. This prevents
    // persisted signed URLs from expiring while keeping list latency bounded.
    const imagePaths = products.flatMap((product) => {
      const image = product.images[0];
      const path =
        image?.thumbnailPath ?? image?.mediumPath ?? image?.storagePath;
      return path ? [path] : [];
    });
    const resolvedUrls = this.storage
      ? await this.storage.getProductImageUrls(imagePaths)
      : new Map<string, string>();
    // Usage telemetry is non-critical and must not add latency to GET /products.
    void this.recordProductUsage(user, tenant, 'products_list', {
      dbReadCount: 2,
      metadata: { count: products.length },
    }).catch(() => undefined);

    return {
      ok: true,
      mode: tenant.mode,
      products: products.map((product) => {
        const image = product.images[0];
        const path =
          image?.thumbnailPath ?? image?.mediumPath ?? image?.storagePath;
        const thumbnailUrl =
          (path ? resolvedUrls.get(path) : null) ??
          image?.thumbnailUrl ??
          image?.mediumUrl ??
          image?.fileUrl ??
          null;
        return {
          id: product.id,
          nome: product.name,
          precoVenda: centsToMoney(product.salePriceCents),
          quantidade: String(product.isWeighable ? decimalStockValue(product.quantityDecimal) : product.quantity),
          pesavel: product.isWeighable,
          unidade: product.unit ?? 'UN',
          categoria: product.category ?? '',
          sku: product.sku ?? '',
          codigoBarra: product.barcode ?? '',
          imagens: thumbnailUrl ? [thumbnailUrl] : [],
          imageMetadata: image
            ? [
                {
                  fileName: image.fileName,
                  id: image.id,
                  fileUrl: thumbnailUrl,
                  storagePath: image.storagePath,
                  thumbnailUrl,
                  thumbnailPath: path,
                },
              ]
            : [],
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async lookupForPos(
    user: AuthenticatedUser | undefined,
    query: ProductLookupQueryDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const scanCode = normalizeScanCode(query.barcode ?? query.code);
    const search = (query.search ?? query.q)?.normalize('NFC').trim();
    const limit = Math.min(query.limit ?? 10, 10);
    if (!scanCode && !search) {
      throw new BadRequestException(
        'Informe barcode, code, search ou q para localizar um produto.',
      );
    }
    if (!scanCode && search!.length < 2) {
      throw new BadRequestException(
        'Informe pelo menos 2 caracteres para pesquisar produtos.',
      );
    }

    const scanCandidates = scanCode ? extractScanCodeCandidates(scanCode) : [];

    const context = await this.contextResolver().resolve(user, {
      selectedBranchId,
      requireBranch: true,
      allowedRoles: [Role.Admin, Role.Vendedor],
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    const scaleLabelResult = scanCode
      ? parseScaleBarcode(scanCode, await this.loadScaleBarcodeConfig(
          context.tenantId,
          context.branchId!,
        ))
      : { kind: 'not-label' as const };
    if (scaleLabelResult.kind === 'invalid') {
      throw new BadRequestException(scaleLabelResult.message);
    }
    const scaleLabel =
      scaleLabelResult.kind === 'label' ? scaleLabelResult.label : null;
    const lookupCandidates = scaleLabel
      ? uniqueScanCandidates([
          ...scanCandidates,
          scaleLabel.productCode,
          scaleLabel.productCode.replace(/^0+/, '') || '0',
        ])
      : scanCandidates;
    const products = await this.prisma.product.findMany({
      where: {
        tenantId: context.tenantId,
        branchId: context.branchId!,
        AND: [
          {
            OR: [
              { isWeighable: false, quantity: { gt: 0 } },
              { isWeighable: true, quantityDecimal: { gt: 0 } },
            ],
          },
          scanCode
            ? {
                OR: [
                  { barcode: { in: lookupCandidates } },
                  { sku: { in: lookupCandidates } },
                ],
              }
            : {
                OR: [
                  { name: { contains: search!, mode: 'insensitive' } },
                  { sku: { contains: search!, mode: 'insensitive' } },
                  { barcode: { contains: search!, mode: 'insensitive' } },
                ],
              },
        ],
      },
      select: {
        id: true,
        name: true,
        barcode: true,
        sku: true,
        salePriceCents: true,
        quantity: true,
        quantityDecimal: true,
        isWeighable: true,
        unit: true,
        images: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      take: scanCode ? Math.max(lookupCandidates.length * 2, 10) : 50,
    });

    const exactRawProduct = scaleLabel
      ? products.find(
          (product) =>
            product.barcode === scanCode || product.sku === scanCode,
        )
      : null;
    const activeScaleLabel = exactRawProduct ? null : scaleLabel;
    const rankedProducts = products
      .sort((left, right) =>
        scanCode
          ? rankScanProduct(left, lookupCandidates) -
            rankScanProduct(right, lookupCandidates)
          : compareSearchProducts(left, right, search!),
      )
      .slice(0, scanCode ? 1 : limit);

    return {
      ok: true,
      products: await Promise.all(
        rankedProducts.map(async (product) => {
          const unit = product.unit?.trim().toUpperCase() || 'UN';
          const weighed = product.isWeighable;
          const image = product.images[0];
          const imageUrl = image
            ? image.thumbnailUrl ||
              image.mediumUrl ||
              image.fileUrl ||
              (this.storage
                ? await this.storage.getProductImageUrl(
                    image.thumbnailPath ?? image.storagePath,
                  )
                : null)
            : null;

          const availableQuantity = weighed
            ? decimalStockValue(product.quantityDecimal)
            : product.quantity;
          const labelQuantity = activeScaleLabel
            ? resolveLabelQuantity(activeScaleLabel, product.salePriceCents)
            : null;
          if (activeScaleLabel && (!weighed || !labelQuantity || labelQuantity <= 0)) {
            throw new BadRequestException(
              'Etiqueta inválida: produto não pesável ou valor sem preço unitário.',
            );
          }
          return {
            id: product.id,
            name: product.name,
            barcode: product.barcode,
            sku: product.sku,
            salePriceCents: product.salePriceCents,
            quantity: availableQuantity,
            suggestedQuantity: labelQuantity,
            saleMode: weighed ? 'weighed' : 'unit',
            unitLabel: unit,
            labelData: activeScaleLabel
              ? {
                  code: activeScaleLabel.raw,
                  productCode: activeScaleLabel.productCode,
                  payloadType: activeScaleLabel.format.payloadType,
                  payload: activeScaleLabel.payload,
                  quantity: labelQuantity,
                }
              : null,
            imageUrl,
          };
        }),
      ),
    };
  }

  async findOne(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.getReadableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );

    if (!tenant) {
      const product = DEMO_PRODUCTS.find((item) => item.id === id);

      if (!product) {
        throw new NotFoundException('Product not found.');
      }

      return { ok: true, mode: SystemMode.visualizacao, product };
    }

    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: tenant.id, branchId: tenant.branchId },
      include: { images: { orderBy: { createdAt: 'desc' } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return {
      ok: true,
      mode: tenant.mode,
      product: await this.formatProduct(product),
    };
  }

  async resolveImageUrl(
    user: AuthenticatedUser | undefined,
    productId: string,
    imageId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (!this.storage) {
      throw new BadRequestException('Product image storage is not configured.');
    }

    const tenant = await this.getReadableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    if (!tenant) {
      throw new UnauthorizedException(SESSION_EXPIRED_MESSAGE);
    }

    const image = await this.prisma.productImage.findFirst({
      where: {
        id: imageId,
        productId,
        product: { tenantId: tenant.id, branchId: tenant.branchId },
      },
      select: {
        fileUrl: true,
        mediumUrl: true,
        thumbnailUrl: true,
        storagePath: true,
        mediumPath: true,
        thumbnailPath: true,
      },
    });
    if (!image) {
      throw new NotFoundException('Product image not found.');
    }

    const url =
      image.thumbnailUrl ||
      image.mediumUrl ||
      image.fileUrl ||
      (await this.storage.getProductImageUrl(
        image.thumbnailPath ?? image.mediumPath ?? image.storagePath,
      ));
    if (!url) {
      throw new NotFoundException('Product image URL not found.');
    }
    return url;
  }

  async create(
    user: AuthenticatedUser | undefined,
    dto: CreateProductDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );

    try {
      const product = await this.prisma.product.create({
        data: {
          tenantId: tenant.id,
          branchId: tenant.branchId,
          ...this.buildCreateData(dto),
        },
        include: { images: true },
      });
      void this.recordProductUsage(user, tenant, 'product_create', {
        dbWriteCount: 1,
        metadata: { productId: product.id },
      }).catch(() => undefined);

      return { ok: true, product: await this.formatProduct(product) };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: UpdateProductDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    await this.assertTenantProduct(tenant.id, tenant.branchId, id);

    try {
      const product = await this.prisma.product.update({
        where: { id, tenantId: tenant.id, branchId: tenant.branchId },
        data: await this.buildUpdateData(tenant.id, tenant.branchId, id, dto),
        include: { images: { orderBy: { createdAt: 'desc' } } },
      });
      void this.recordProductUsage(user, tenant, 'product_update', {
        dbWriteCount: 1,
        metadata: { productId: product.id },
      }).catch(() => undefined);

      return { ok: true, product: await this.formatProduct(product) };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(
    user: AuthenticatedUser | undefined,
    id: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    await this.assertTenantProduct(tenant.id, tenant.branchId, id);

    await this.prisma.product.delete({
      where: { id, tenantId: tenant.id, branchId: tenant.branchId },
    });
    void this.recordProductUsage(user, tenant, 'product_delete', {
      dbWriteCount: 1,
      metadata: { productId: id },
    }).catch(() => undefined);

    return { ok: true };
  }

  async addImages(
    user: AuthenticatedUser | undefined,
    id: string,
    dto: CreateProductImagesDto,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    await this.assertTenantProduct(tenant.id, tenant.branchId, id);

    const existingCount = await this.prisma.productImage.count({
      where: { productId: id },
    });

    if (existingCount + dto.images.length > 3) {
      throw new BadRequestException('A product can have at most 3 images.');
    }

    dto.images.forEach((image) => {
      if (!image.fileUrl?.trim() && !image.storagePath?.trim()) {
        throw new BadRequestException(
          'Product image metadata requires fileUrl or storagePath. Use /images/upload for file uploads.',
        );
      }
    });

    await this.prisma.productImage.createMany({
      data: dto.images.map((image) => ({
        productId: id,
        fileName: image.fileName.trim(),
        fileUrl: image.fileUrl?.trim() || null,
        storagePath: image.storagePath?.trim() || null,
      })),
    });
    await this.recordProductUsage(user, tenant, 'product_image_upload', {
      dbWriteCount: 1,
      metadata: { productId: id, imageCount: dto.images.length },
    });

    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: tenant.id, branchId: tenant.branchId },
      include: { images: { orderBy: { createdAt: 'desc' } } },
    });

    return { ok: true, product: await this.formatProduct(product!) };
  }

  async uploadImage(
    user: AuthenticatedUser | undefined,
    id: string,
    file: UploadFile,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (!this.storage) {
      throw new BadRequestException('Product image storage is not configured.');
    }

    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    await this.assertTenantProduct(tenant.id, tenant.branchId, id);

    const existingCount = await this.prisma.productImage.count({
      where: { productId: id },
    });

    if (existingCount >= 3) {
      throw new BadRequestException('A product can have at most 3 images.');
    }

    const uploaded = await this.storage.uploadProductImage({
      tenantId: tenant.id,
      branchId: tenant.branchId,
      productId: id,
      ownerProfileId: user?.id,
      file,
    });

    try {
      const image = await this.prisma.productImage.create({
        data: {
          productId: id,
          ...uploaded,
        },
      });
      await this.recordProductUsage(user, tenant, 'product_image_upload', {
        dbWriteCount: 1,
        metadata: { productId: id, imageId: image.id },
      });

      return { ok: true, image };
    } catch (error) {
      await this.storage.removeProductImage(
        uploaded.storagePath,
        uploaded.mediumPath,
        uploaded.thumbnailPath,
      );
      throw error;
    }
  }

  async removeImage(
    user: AuthenticatedUser | undefined,
    id: string,
    imageId: string,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    const tenant = await this.requireWritableTenant(
      user,
      selectedBranchId,
      devContextMode,
    );
    await this.assertTenantProduct(tenant.id, tenant.branchId, id);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId: id },
      select: {
        id: true,
        storagePath: true,
        mediumPath: true,
        thumbnailPath: true,
      },
    });

    if (!image) {
      throw new NotFoundException('Product image not found.');
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });
    await this.storage?.removeProductImage(
      image.storagePath,
      image.mediumPath,
      image.thumbnailPath,
    );

    return { ok: true };
  }

  private async loadScaleBarcodeConfig(
    tenantId: string,
    branchId: string,
  ): Promise<ScaleBarcodeConfig | null> {
    const config = await this.prisma.companyFiscalConfig?.findUnique({
      where: { tenantId_branchId: { tenantId, branchId } },
      select: { providerConfig: true },
    });
    const providerConfig =
      config?.providerConfig &&
      typeof config.providerConfig === 'object' &&
      !Array.isArray(config.providerConfig)
        ? (config.providerConfig as Record<string, unknown>)
        : null;
    const configured =
      providerConfig?.scaleBarcode ?? providerConfig?.scaleLabel;
    return configured && typeof configured === 'object' && !Array.isArray(configured)
      ? (configured as ScaleBarcodeConfig)
      : null;
  }

  private async getReadableTenant(
    user?: AuthenticatedUser,
    selectedBranchId?: string,
    devContextMode?: string,
  ) {
    if (!user) {
      return null;
    }

    const context = await this.contextResolver().resolve(user, {
      selectedBranchId,
      requireBranch: true,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    return {
      id: context.tenantId,
      branchId: context.branchId!,
      mode: context.mode,
      systemType: context.systemType,
      contextKind: context.contextKind,
    };
  }

  private async requireWritableTenant(
    user?: AuthenticatedUser,
    selectedBranchId?: string | null,
    devContextMode?: string,
  ) {
    const context = await this.contextResolver().resolve(user, {
      selectedBranchId,
      requireBranch: true,
      writable: true,
      allowDevSupport: devContextMode?.toLowerCase() === 'support',
    });
    return {
      id: context.tenantId,
      branchId: context.branchId!,
      mode: context.mode,
      systemType: context.systemType,
      contextKind: context.contextKind,
    };
  }

  private async assertTenantProduct(
    tenantId: string,
    branchId: string,
    id: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, branchId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }
  }

  private contextResolver() {
    return (
      this.tenantContext ??
      new TenantContextService(
        this.prisma,
        new DevWorkspaceService(this.prisma),
      )
    );
  }

  private buildCreateData(dto: CreateProductDto) {
    const costPriceCents = moneyToCents(dto.precoCusto);
    const profitPercent = new Prisma.Decimal(dto.percentualLucro);
    const quantity = normalizeQuantity(dto.quantidade);
    const unit = clean(dto.unit)?.toUpperCase() ?? null;
    const isWeighable =
      dto.isWeighable === true ||
      ['KG', 'KGM', 'G', 'GR'].includes(unit ?? '');
    if (isWeighable && !unit) {
      throw new BadRequestException('Produto pesável deve informar a unidade de venda.');
    }
    if (!isWeighable && !Number.isInteger(quantity)) {
      throw new BadRequestException('Produtos vendidos por unidade aceitam apenas quantidade inteira.');
    }

    return {
      name: dto.nome.trim(),
      costPriceCents,
      profitPercent,
      salePriceCents: calculateSalePriceCents(
        costPriceCents,
        dto.percentualLucro,
      ),
      quantity: isWeighable ? 0 : quantity,
      quantityDecimal: isWeighable ? new Prisma.Decimal(quantity) : null,
      isWeighable,
      brand: clean(dto.marca),
      category: clean(dto.categoria),
      supplier: clean(dto.fornecedor),
      sku: clean(dto.sku),
      barcode: cleanScanCode(dto.codigoBarra),
      description: clean(dto.descricao),
      weight: clean(dto.peso),
      height: clean(dto.altura),
      width: clean(dto.largura),
      externalLink: clean(dto.linkExterno),
      clothingSize: clean(dto.tamanhoRoupa),
      apparelSize: clean(dto.tamanhoVestimenta),
      ncm: fiscalDigits(dto.ncm),
      cfopDefault: fiscalDigits(dto.cfopDefault),
      cest: fiscalDigits(dto.cest),
      origin: fiscalDigits(dto.origin),
      unit,
      taxableUnit: clean(dto.taxableUnit)?.toUpperCase() ?? unit,
      icmsCst: fiscalDigits(dto.icmsCst),
      icmsCsosn: fiscalDigits(dto.icmsCsosn),
      ipiCode: fiscalDigits(dto.ipiCode),
      pisCode: fiscalDigits(dto.pisCode),
      cofinsCode: fiscalDigits(dto.cofinsCode),
      icmsRate:
        dto.icmsRate === undefined ? null : new Prisma.Decimal(dto.icmsRate),
      ipiRate:
        dto.ipiRate === undefined ? null : new Prisma.Decimal(dto.ipiRate),
      pisRate:
        dto.pisRate === undefined ? null : new Prisma.Decimal(dto.pisRate),
      cofinsRate:
        dto.cofinsRate === undefined
          ? null
          : new Prisma.Decimal(dto.cofinsRate),
    };
  }

  private async buildUpdateData(
    tenantId: string,
    branchId: string,
    id: string,
    dto: UpdateProductDto,
  ) {
    const data: Prisma.ProductUncheckedUpdateInput = {};
    const currentStock = await this.prisma.product.findUniqueOrThrow({
      where: { id, tenantId, branchId },
      select: { quantity: true, quantityDecimal: true, isWeighable: true, unit: true },
    });
    const finalWeighable = dto.isWeighable ?? currentStock.isWeighable;
    const finalUnit =
      dto.unit !== undefined
        ? clean(dto.unit)?.toUpperCase() ?? null
        : currentStock.unit;
    const finalQuantity =
      dto.quantidade !== undefined
        ? normalizeQuantity(dto.quantidade)
        : finalWeighable
          ? decimalStockValue(currentStock.quantityDecimal)
          : currentStock.quantity;
    if (finalWeighable && !finalUnit) {
      throw new BadRequestException('Produto pesável deve informar a unidade de venda.');
    }
    if (!finalWeighable && !Number.isInteger(finalQuantity)) {
      throw new BadRequestException('Produtos vendidos por unidade aceitam apenas quantidade inteira.');
    }

    if (dto.nome !== undefined) data.name = dto.nome.trim();
    if (dto.quantidade !== undefined) {
      const quantity = normalizeQuantity(dto.quantidade);
      data.quantity = Number.isInteger(quantity) ? quantity : 0;
      data.quantityDecimal = new Prisma.Decimal(quantity);
    }
    if (dto.isWeighable !== undefined) data.isWeighable = dto.isWeighable;
    if (dto.marca !== undefined) data.brand = clean(dto.marca);
    if (dto.categoria !== undefined) data.category = clean(dto.categoria);
    if (dto.fornecedor !== undefined) data.supplier = clean(dto.fornecedor);
    if (dto.sku !== undefined) data.sku = clean(dto.sku);
    if (dto.codigoBarra !== undefined) {
      data.barcode = cleanScanCode(dto.codigoBarra);
    }
    if (dto.descricao !== undefined) data.description = clean(dto.descricao);
    if (dto.peso !== undefined) data.weight = clean(dto.peso);
    if (dto.altura !== undefined) data.height = clean(dto.altura);
    if (dto.largura !== undefined) data.width = clean(dto.largura);
    if (dto.linkExterno !== undefined)
      data.externalLink = clean(dto.linkExterno);
    if (dto.tamanhoRoupa !== undefined)
      data.clothingSize = clean(dto.tamanhoRoupa);
    if (dto.tamanhoVestimenta !== undefined)
      data.apparelSize = clean(dto.tamanhoVestimenta);
    if (dto.ncm !== undefined) data.ncm = fiscalDigits(dto.ncm);
    if (dto.cfopDefault !== undefined)
      data.cfopDefault = fiscalDigits(dto.cfopDefault);
    if (dto.cest !== undefined) data.cest = fiscalDigits(dto.cest);
    if (dto.origin !== undefined) data.origin = fiscalDigits(dto.origin);
    if (dto.unit !== undefined)
      data.unit = clean(dto.unit)?.toUpperCase() ?? null;
    if (dto.taxableUnit !== undefined)
      data.taxableUnit = clean(dto.taxableUnit)?.toUpperCase() ?? null;
    if (dto.icmsCst !== undefined) data.icmsCst = fiscalDigits(dto.icmsCst);
    if (dto.icmsCsosn !== undefined) data.icmsCsosn = fiscalDigits(dto.icmsCsosn);
    if (dto.ipiCode !== undefined) data.ipiCode = fiscalDigits(dto.ipiCode);
    if (dto.pisCode !== undefined) data.pisCode = fiscalDigits(dto.pisCode);
    if (dto.cofinsCode !== undefined) data.cofinsCode = fiscalDigits(dto.cofinsCode);
    if (dto.icmsRate !== undefined)
      data.icmsRate = new Prisma.Decimal(dto.icmsRate);
    if (dto.ipiRate !== undefined)
      data.ipiRate = new Prisma.Decimal(dto.ipiRate);
    if (dto.pisRate !== undefined)
      data.pisRate = new Prisma.Decimal(dto.pisRate);
    if (dto.cofinsRate !== undefined)
      data.cofinsRate = new Prisma.Decimal(dto.cofinsRate);

    if (dto.precoCusto !== undefined || dto.percentualLucro !== undefined) {
      const current = await this.prisma.product.findUniqueOrThrow({
        where: { id, tenantId, branchId },
        select: { costPriceCents: true, profitPercent: true },
      });
      const costPriceCents =
        dto.precoCusto !== undefined
          ? moneyToCents(dto.precoCusto)
          : current.costPriceCents;
      const profitPercent =
        dto.percentualLucro !== undefined
          ? dto.percentualLucro
          : Number(current.profitPercent);

      data.costPriceCents = costPriceCents;
      data.profitPercent = new Prisma.Decimal(profitPercent);
      data.salePriceCents = calculateSalePriceCents(
        costPriceCents,
        profitPercent,
      );
    }

    return data;
  }

  private async formatProduct(product: ProductWithImages) {
    const imageMetadata = await Promise.all(
      product.images.map(async (image) => {
        const renderUrl =
          (this.storage && (image.mediumPath || image.storagePath)
            ? await this.storage.getProductImageUrl(
                image.mediumPath || image.storagePath,
              )
            : null) ||
          image.mediumUrl ||
          image.fileUrl ||
          null;
        const thumbnailUrl =
          (this.storage && (image.thumbnailPath || image.mediumPath || image.storagePath)
            ? await this.storage.getProductImageUrl(
                image.thumbnailPath || image.mediumPath || image.storagePath,
              )
            : null) ||
          image.thumbnailUrl ||
          renderUrl;

        return {
          id: image.id,
          fileName: image.fileName,
          fileUrl: renderUrl,
          storagePath: image.storagePath,
          mediumUrl: image.mediumUrl,
          mediumPath: image.mediumPath,
          thumbnailUrl,
          thumbnailPath: image.thumbnailPath,
          mimeType: image.mimeType,
          size: image.size,
          originalSize: image.originalSize,
          width: image.width,
          height: image.height,
          thumbnailSize: image.thumbnailSize,
          createdAt: image.createdAt,
        };
      }),
    );

    return {
      id: product.id,
      nome: product.name,
      precoCusto: centsToMoney(product.costPriceCents),
      percentualLucro: Number(product.profitPercent).toString(),
      precoVenda: centsToMoney(product.salePriceCents),
      quantidade: String(product.isWeighable ? decimalStockValue(product.quantityDecimal) : product.quantity),
      pesavel: product.isWeighable,
      marca: product.brand ?? '',
      categoria: product.category ?? '',
      fornecedor: product.supplier ?? '',
      sku: product.sku ?? '',
      codigoBarra: product.barcode ?? '',
      descricao: product.description ?? '',
      peso: product.weight ?? '',
      altura: product.height ?? '',
      largura: product.width ?? '',
      linkExterno: product.externalLink ?? '',
      tamanhoRoupa: product.clothingSize ?? '',
      tamanhoVestimenta: product.apparelSize ?? '',
      ncm: product.ncm ?? '',
      cfopDefault: product.cfopDefault ?? '',
      cest: product.cest ?? '',
      origin: product.origin ?? '',
      unit: product.unit ?? '',
      taxableUnit: product.taxableUnit ?? product.unit ?? '',
      icmsCst: product.icmsCst ?? '',
      icmsCsosn: product.icmsCsosn ?? '',
      ipiCode: product.ipiCode ?? '',
      pisCode: product.pisCode ?? '',
      cofinsCode: product.cofinsCode ?? '',
      unidadeVenda: product.unit ?? 'UN',
      isWeighable: product.isWeighable,
      icmsRate: product.icmsRate === null ? null : Number(product.icmsRate),
      ipiRate: product.ipiRate === null ? null : Number(product.ipiRate),
      pisRate: product.pisRate === null ? null : Number(product.pisRate),
      cofinsRate:
        product.cofinsRate === null ? null : Number(product.cofinsRate),
      imagens: imageMetadata.map((image) => image.fileUrl).filter(Boolean),
      imageMetadata,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }

  private filterDemoProducts(query: ProductQueryDto) {
    const search = query.search?.trim().toLowerCase();
    const sku = query.sku?.trim().toLowerCase();
    const barcode = query.barcode?.trim().toLowerCase();
    const category = query.category?.trim().toLowerCase();

    return DEMO_PRODUCTS.filter((product) => {
      if (search && !product.nome.toLowerCase().includes(search)) return false;
      if (sku && product.sku.toLowerCase() !== sku) return false;
      if (barcode && product.codigoBarra.toLowerCase() !== barcode)
        return false;
      if (category && !product.categoria.toLowerCase().includes(category))
        return false;
      return true;
    });
  }

  private async recordProductUsage(
    user: AuthenticatedUser | undefined,
    context: {
      id: string;
      branchId: string;
      systemType?: string;
      contextKind?: string;
    },
    eventType: string,
    options: {
      dbReadCount?: number;
      dbWriteCount?: number;
      metadata?: Record<string, unknown>;
    } = {},
  ) {
    await this.usageService?.record({
      user,
      tenantId: context.id,
      branchId: context.branchId,
      systemType: context.systemType ?? user?.systemType,
      eventType,
      dbReadCount: options.dbReadCount ?? 0,
      dbWriteCount: options.dbWriteCount ?? 0,
      metadata: {
        ...(options.metadata ?? {}),
        contextKind: context.contextKind ?? 'normal',
      },
    });
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException(
          'SKU or barcode already exists for this branch.',
        );
      }
    }

    throw error;
  }
}

function resolveLabelQuantity(label: ParsedScaleLabel, salePriceCents: number) {
  if (label.format.payloadType === 'weight') return label.quantity ?? 0;
  if (salePriceCents <= 0 || !label.payloadCents) return 0;
  return Math.round((label.payloadCents / salePriceCents) * 1_000_000) / 1_000_000;
}

function uniqueScanCandidates(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function clean(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function cleanScanCode(value?: string) {
  const cleaned = normalizeScanCode(value);
  return cleaned || null;
}

function fiscalDigits(value?: string) {
  const cleaned = value?.replace(/\D/g, '');
  return cleaned || null;
}

type PosLookupProduct = {
  name: string;
  sku: string | null;
  barcode: string | null;
};

function rankScanProduct(
  product: PosLookupProduct,
  candidates: string[],
): number {
  const barcodeIndex = product.barcode
    ? candidates.indexOf(product.barcode)
    : -1;
  const skuIndex = product.sku ? candidates.indexOf(product.sku) : -1;

  if (barcodeIndex >= 0) return barcodeIndex * 2;
  if (skuIndex >= 0) return skuIndex * 2 + 1;
  return Number.MAX_SAFE_INTEGER;
}

function compareSearchProducts(
  left: PosLookupProduct,
  right: PosLookupProduct,
  search: string,
) {
  const normalizedSearch = search.toLocaleLowerCase('pt-BR');
  const score = (product: PosLookupProduct) => {
    if (
      product.barcode?.toLocaleLowerCase('pt-BR') === normalizedSearch ||
      product.sku?.toLocaleLowerCase('pt-BR') === normalizedSearch
    ) {
      return 0;
    }
    if (product.name.toLocaleLowerCase('pt-BR').startsWith(normalizedSearch)) {
      return 1;
    }
    if (
      product.sku?.toLocaleLowerCase('pt-BR').startsWith(normalizedSearch) ||
      product.barcode?.toLocaleLowerCase('pt-BR').startsWith(normalizedSearch)
    ) {
      return 2;
    }
    return 3;
  };

  return (
    score(left) - score(right) ||
    left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' })
  );
}

function moneyToCents(value: number) {
  return Math.round(value * 100);
}

function centsToMoney(value: number) {
  return (value / 100).toFixed(2);
}

function calculateSalePriceCents(
  costPriceCents: number,
  profitPercent: number,
) {
  return Math.round(costPriceCents + costPriceCents * (profitPercent / 100));
}
