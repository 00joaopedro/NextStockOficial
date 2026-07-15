import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImagesDto } from './dto/product-image.dto';
import { ProductLookupQueryDto } from './dto/product-lookup-query.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { readFastifyUpload } from '../storage/fastify-upload.util';
import { ProductsService } from './products.service';
import {
  PublicRateLimitGuard,
  RateLimit,
} from '../security/public-rate-limit.guard';

@Controller('products')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('lookup')
  @Roles(Role.Admin, Role.Vendedor)
  @UseGuards(JwtAuthGuard, RolesGuard, BranchContextGuard)
  @RequireTenantContext({ requireBranch: true })
  lookup(
    @Req() req: Request,
    @Query() query: ProductLookupQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.lookupForPos(
      req.user,
      query,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Req() req: Request,
    @Query() query: ProductQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.findAll(
      req.user,
      query,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.findOne(
      req.user,
      id,
      selectedBranchId,
      devContextMode,
    );
  }

  @Post()
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(
    @Req() req: Request,
    @Body() body: CreateProductDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.create(
      req.user,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Patch(':id')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProductDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.update(
      req.user,
      id,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.remove(
      req.user,
      id,
      selectedBranchId,
      devContextMode,
    );
  }

  @Post(':id/images')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  addImages(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProductImagesDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.addImages(
      req.user,
      id,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Post(':id/images/upload')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseGuards(PublicRateLimitGuard)
  @RateLimit({ max: 20, windowMs: 60_000 })
  async uploadImage(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    const { file } = await readFastifyUpload(req);
    return this.productsService.uploadImage(
      req.user,
      id,
      file,
      selectedBranchId,
      devContextMode,
    );
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  removeImage(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.productsService.removeImage(
      req.user,
      id,
      imageId,
      selectedBranchId,
      devContextMode,
    );
  }
}
