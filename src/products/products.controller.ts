import {
  Body,
  Controller,
  Delete,
  Get,
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
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductImagesDto } from './dto/product-image.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(OptionalJwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(@Req() req: Request, @Query() query: ProductQueryDto) {
    return this.productsService.findAll(req.user, query);
  }

  @Get(':id')
  findOne(@Req() req: Request, @Param('id') id: string) {
    return this.productsService.findOne(req.user, id);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreateProductDto) {
    return this.productsService.create(req.user, body);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(req.user, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.productsService.remove(req.user, id);
  }

  @Post(':id/images')
  addImages(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateProductImagesDto,
  ) {
    return this.productsService.addImages(req.user, id, body);
  }

  @Delete(':id/images/:imageId')
  removeImage(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.productsService.removeImage(req.user, id, imageId);
  }
}
