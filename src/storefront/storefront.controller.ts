import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from '../common/http-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';
import {
  CreateGuestOrderDto,
  PublicProductsQueryDto,
} from './dto/storefront-public.dto';
import {
  UpdateStorefrontProductDto,
  UpsertStorefrontDto,
} from './dto/storefront-admin.dto';
import { StorefrontService } from './storefront.service';

@Controller('storefront')
@UseGuards(JwtAuthGuard, RolesGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
export class StorefrontAdminController {
  constructor(private readonly service: StorefrontService) {}
  @Get() @Roles(Role.Admin) get(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
  ) {
    return this.service.getAdmin(req.user, branchId);
  }
  @Post() @Roles(Role.Admin) @UseGuards(PreviewMutationGuard) upsert(
    @Req() req: Request,
    @Body() dto: UpsertStorefrontDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
  ) {
    return this.service.upsertAdmin(req.user, dto, branchId);
  }
  @Get('products') @Roles(Role.Admin) products(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') branchId?: string,
  ) {
    return this.service.listAdminProducts(req.user, branchId);
  }
  @Patch('products')
  @Roles(Role.Admin)
  @UseGuards(PreviewMutationGuard)
  updateProduct(
    @Req() req: Request,
    @Body() dto: UpdateStorefrontProductDto,
    @Headers('x-nextstock-branch-id') branchId?: string,
  ) {
    return this.service.updateAdminProduct(req.user, dto, branchId);
  }
}

@Controller('public/storefronts')
@UseGuards(PublicRateLimitGuard)
export class StorefrontPublicController {
  constructor(private readonly service: StorefrontService) {}
  @Get(':slug') @RateLimit({ max: 120, windowMs: 60000 }) get(
    @Param('slug') slug: string,
  ) {
    return this.service.getPublic(slug);
  }
  @Get(':slug/products') @RateLimit({ max: 120, windowMs: 60000 }) products(
    @Param('slug') slug: string,
    @Query() query: PublicProductsQueryDto,
  ) {
    return this.service.listPublicProducts(slug, query);
  }
  @Get(':slug/products/:productSlug')
  @RateLimit({ max: 120, windowMs: 60000 })
  product(
    @Param('slug') slug: string,
    @Param('productSlug') productSlug: string,
  ) {
    return this.service.getPublicProduct(slug, productSlug);
  }
  @Post(':slug/orders') @RateLimit({ max: 10, windowMs: 600000 }) order(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() dto: CreateGuestOrderDto,
  ) {
    return this.service.createGuestOrder(slug, key, dto, meta(req));
  }
  @Get(':slug/orders') @RateLimit({ max: 30, windowMs: 600000 }) orders(
    @Param('slug') slug: string,
    @Query('phone') phone: string,
    @Headers('x-storefront-order-token') token: string,
  ) {
    return this.service.listGuestOrders(slug, phone, token);
  }
  @Delete(':slug/orders/:reference')
  @RateLimit({ max: 10, windowMs: 600000 })
  cancel(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Param('reference') reference: string,
    @Headers('x-storefront-order-token') token: string,
  ) {
    return this.service.cancelGuestOrder(slug, reference, token, meta(req));
  }
}
function meta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.headers?.['user-agent'] as string | undefined,
    requestId: (req as Request & { requestId?: string }).requestId,
  };
}
