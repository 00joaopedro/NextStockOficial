import {
  Body,
  Controller,
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
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { CreateSaleDocumentDto } from './dto/create-sale-document.dto';
import { CreateSaleFromOrderDto } from './dto/create-sale-from-order.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SaleQueryDto } from './dto/sale-query.dto';
import { SalesService } from './sales.service';
import { FiscalService } from '../fiscal/fiscal.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly fiscalService: FiscalService,
  ) {}

  @Get()
  @Roles(Role.Admin, Role.Vendedor)
  findAll(
    @Req() req: Request,
    @Query() query: SaleQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.findAll(req.user, query, selectedBranchId, devContextMode);
  }

  @Get(':id/receipt')
  @Roles(Role.Admin, Role.Vendedor)
  receipt(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.receipt(req.user, id, selectedBranchId, devContextMode);
  }

  @Get(':id/documents')
  @Roles(Role.Admin, Role.Vendedor)
  documents(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.listDocuments(req.user, id, selectedBranchId, devContextMode);
  }

  @Get(':id/documents/:documentId/download')
  @Roles(Role.Admin, Role.Vendedor)
  downloadDocument(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Query('format') format?: 'pdf' | 'xml',
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.downloadDocument(
      req.user,
      id,
      documentId,
      format,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Vendedor)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.findOne(req.user, id, selectedBranchId, devContextMode);
  }

  @Post()
  @Roles(Role.Admin, Role.Vendedor)
  create(
    @Req() req: Request,
    @Body() body: CreateSaleDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.create(req.user, body, selectedBranchId, devContextMode);
  }

  @Post('from-order/:orderId')
  @Roles(Role.Admin, Role.Vendedor)
  createFromOrder(
    @Req() req: Request,
    @Param('orderId') orderId: string,
    @Body() body: CreateSaleFromOrderDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.createFromOrder(
      req.user,
      orderId,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Patch(':id/cancel')
  @Roles(Role.Admin)
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CancelSaleDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.cancel(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Post(':id/documents/nfe55')
  @Roles(Role.Admin)
  createNfe55(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateSaleDocumentDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.fiscalService.createDocument(
      req.user,
      {
        saleId: id,
        ...body,
      },
      selectedBranchId,
      devContextMode,
    );
  }

  @Post(':id/documents/nfce65')
  @Roles(Role.Admin)
  createNfce65(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CreateSaleDocumentDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.salesService.createFiscalDocument(
      req.user,
      id,
      'nfce65',
      body,
      selectedBranchId,
      devContextMode,
    );
  }
}
