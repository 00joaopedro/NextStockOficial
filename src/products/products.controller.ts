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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImagesDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @Req() req: Request,
    @Query() query: ProductQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.findAll(req.user, query, selectedBranchId);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.findOne(req.user, id, selectedBranchId);
  }

  @Post()
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  create(
    @Req() req: Request,
    @Body() body: CreateProductDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.create(req.user, body, selectedBranchId);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.update(req.user, id, body, selectedBranchId);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.remove(req.user, id, selectedBranchId);
  }

  @Post(':id/images')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  addImages(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateProductImagesDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.addImages(req.user, id, body, selectedBranchId);
  }

  @Delete(':id/images/:imageId')
  @Roles(Role.Admin)
  @UseGuards(JwtAuthGuard, RolesGuard)
  removeImage(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.productsService.removeImage(req.user, id, imageId, selectedBranchId);
  }
}
