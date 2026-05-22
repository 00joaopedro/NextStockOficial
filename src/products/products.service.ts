import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Product, ProductImage, SystemMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImagesDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const PREVIEW_BLOCKED_MESSAGE = 'Modo visualização: alteração bloqueada.';

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

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: Express.AuthenticatedUser | undefined, query: ProductQueryDto) {
    const tenant = await this.getReadableTenant(user);

    if (!tenant || tenant.mode === SystemMode.visualizacao) {
      return {
        ok: true,
        mode: SystemMode.visualizacao,
        products: this.filterDemoProducts(query),
      };
    }

    const where: Prisma.ProductWhereInput = {
      tenantId: tenant.id,
    };

    if (query.search) {
      where.name = { contains: query.search.trim(), mode: 'insensitive' };
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

    const products = await this.prisma.product.findMany({
      where,
      include: { images: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ok: true,
      mode: tenant.mode,
      products: products.map((product) => this.formatProduct(product)),
    };
  }

  async findOne(user: Express.AuthenticatedUser | undefined, id: string) {
    const tenant = await this.getReadableTenant(user);

    if (!tenant || tenant.mode === SystemMode.visualizacao) {
      const product = DEMO_PRODUCTS.find((item) => item.id === id);

      if (!product) {
        throw new NotFoundException('Product not found.');
      }

      return { ok: true, mode: SystemMode.visualizacao, product };
    }

    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: tenant.id },
      include: { images: { orderBy: { createdAt: 'asc' } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return { ok: true, mode: tenant.mode, product: this.formatProduct(product) };
  }

  async create(user: Express.AuthenticatedUser | undefined, dto: CreateProductDto) {
    const tenant = await this.requireWritableTenant(user);

    try {
      const product = await this.prisma.product.create({
        data: {
          tenantId: tenant.id,
          ...this.buildCreateData(dto),
        },
        include: { images: true },
      });

      return { ok: true, product: this.formatProduct(product) };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async update(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: UpdateProductDto,
  ) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantProduct(tenant.id, id);

    try {
      const product = await this.prisma.product.update({
        where: { id },
        data: await this.buildUpdateData(id, dto),
        include: { images: { orderBy: { createdAt: 'asc' } } },
      });

      return { ok: true, product: this.formatProduct(product) };
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(user: Express.AuthenticatedUser | undefined, id: string) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantProduct(tenant.id, id);

    await this.prisma.product.delete({ where: { id } });

    return { ok: true };
  }

  async addImages(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    dto: CreateProductImagesDto,
  ) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantProduct(tenant.id, id);

    const existingCount = await this.prisma.productImage.count({
      where: { productId: id },
    });

    if (existingCount + dto.images.length > 3) {
      throw new BadRequestException('A product can have at most 3 images.');
    }

    await this.prisma.productImage.createMany({
      data: dto.images.map((image) => ({
        productId: id,
        fileName: image.fileName.trim(),
        fileUrl: image.fileUrl?.trim() || null,
        storagePath: image.storagePath?.trim() || null,
      })),
    });

    const product = await this.prisma.product.findFirst({
      where: { id, tenantId: tenant.id },
      include: { images: { orderBy: { createdAt: 'asc' } } },
    });

    return { ok: true, product: this.formatProduct(product!) };
  }

  async removeImage(
    user: Express.AuthenticatedUser | undefined,
    id: string,
    imageId: string,
  ) {
    const tenant = await this.requireWritableTenant(user);
    await this.assertTenantProduct(tenant.id, id);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId: id },
      select: { id: true },
    });

    if (!image) {
      throw new NotFoundException('Product image not found.');
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });

    return { ok: true };
  }

  private async getReadableTenant(user?: Express.AuthenticatedUser) {
    if (!user?.tenantId) {
      return null;
    }

    return this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { id: true, mode: true },
    });
  }

  private async requireWritableTenant(user?: Express.AuthenticatedUser) {
    if (!user?.tenantId) {
      throw new ForbiddenException(PREVIEW_BLOCKED_MESSAGE);
    }

    const tenant = await this.getReadableTenant(user);

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found.');
    }

    if (tenant.mode === SystemMode.visualizacao) {
      throw new ForbiddenException(PREVIEW_BLOCKED_MESSAGE);
    }

    return tenant;
  }

  private async assertTenantProduct(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }
  }

  private buildCreateData(dto: CreateProductDto) {
    const costPriceCents = moneyToCents(dto.precoCusto);
    const profitPercent = new Prisma.Decimal(dto.percentualLucro);

    return {
      name: dto.nome.trim(),
      costPriceCents,
      profitPercent,
      salePriceCents: calculateSalePriceCents(costPriceCents, dto.percentualLucro),
      quantity: dto.quantidade,
      brand: clean(dto.marca),
      category: clean(dto.categoria),
      supplier: clean(dto.fornecedor),
      sku: clean(dto.sku),
      barcode: clean(dto.codigoBarra),
      description: clean(dto.descricao),
      weight: clean(dto.peso),
      height: clean(dto.altura),
      width: clean(dto.largura),
      externalLink: clean(dto.linkExterno),
      clothingSize: clean(dto.tamanhoRoupa),
      apparelSize: clean(dto.tamanhoVestimenta),
    };
  }

  private async buildUpdateData(id: string, dto: UpdateProductDto) {
    const data: Prisma.ProductUncheckedUpdateInput = {};

    if (dto.nome !== undefined) data.name = dto.nome.trim();
    if (dto.quantidade !== undefined) data.quantity = dto.quantidade;
    if (dto.marca !== undefined) data.brand = clean(dto.marca);
    if (dto.categoria !== undefined) data.category = clean(dto.categoria);
    if (dto.fornecedor !== undefined) data.supplier = clean(dto.fornecedor);
    if (dto.sku !== undefined) data.sku = clean(dto.sku);
    if (dto.codigoBarra !== undefined) data.barcode = clean(dto.codigoBarra);
    if (dto.descricao !== undefined) data.description = clean(dto.descricao);
    if (dto.peso !== undefined) data.weight = clean(dto.peso);
    if (dto.altura !== undefined) data.height = clean(dto.altura);
    if (dto.largura !== undefined) data.width = clean(dto.largura);
    if (dto.linkExterno !== undefined) data.externalLink = clean(dto.linkExterno);
    if (dto.tamanhoRoupa !== undefined) data.clothingSize = clean(dto.tamanhoRoupa);
    if (dto.tamanhoVestimenta !== undefined) data.apparelSize = clean(dto.tamanhoVestimenta);

    if (dto.precoCusto !== undefined || dto.percentualLucro !== undefined) {
      const current = await this.prisma.product.findUniqueOrThrow({
        where: { id },
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
      data.salePriceCents = calculateSalePriceCents(costPriceCents, profitPercent);
    }

    return data;
  }

  private formatProduct(product: ProductWithImages) {
    return {
      id: product.id,
      nome: product.name,
      precoCusto: centsToMoney(product.costPriceCents),
      percentualLucro: Number(product.profitPercent).toString(),
      precoVenda: centsToMoney(product.salePriceCents),
      quantidade: String(product.quantity),
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
      imagens: product.images.map((image) => image.fileName),
      imageMetadata: product.images.map((image) => ({
        id: image.id,
        fileName: image.fileName,
        fileUrl: image.fileUrl,
        storagePath: image.storagePath,
        createdAt: image.createdAt,
      })),
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
      if (barcode && product.codigoBarra.toLowerCase() !== barcode) return false;
      if (category && !product.categoria.toLowerCase().includes(category)) return false;
      return true;
    });
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException('SKU or barcode already exists for this tenant.');
      }
    }

    throw error;
  }
}

function clean(value?: string) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
}

function moneyToCents(value: number) {
  return Math.round(value * 100);
}

function centsToMoney(value: number) {
  return (value / 100).toFixed(2);
}

function calculateSalePriceCents(costPriceCents: number, profitPercent: number) {
  return Math.round(costPriceCents + costPriceCents * (profitPercent / 100));
}
