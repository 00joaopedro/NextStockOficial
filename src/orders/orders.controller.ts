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
import { Role } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Roles(Role.Admin, Role.Vendedor)
  findAll(
    @Req() req: Request,
    @Query() query: OrderQueryDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.findAll(req.user, query, selectedBranchId, devContextMode);
  }

  @Get(':id/receipt')
  @Roles(Role.Admin, Role.Vendedor)
  receipt(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.receipt(req.user, id, selectedBranchId, devContextMode);
  }

  @Get(':id/nfe-draft')
  @Roles(Role.Admin, Role.Vendedor)
  nfeDraft(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.nfeDraft(req.user, id, selectedBranchId, devContextMode);
  }

  @Get(':id')
  @Roles(Role.Admin, Role.Vendedor)
  findOne(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.findOne(req.user, id, selectedBranchId, devContextMode);
  }

  @Post()
  @Roles(Role.Admin, Role.Vendedor)
  create(
    @Req() req: Request,
    @Body() body: CreateOrderDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.create(req.user, body, selectedBranchId, devContextMode);
  }

  @Patch(':id')
  @Roles(Role.Admin, Role.Vendedor)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.update(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Patch(':id/status')
  @Roles(Role.Admin, Role.Vendedor)
  updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateOrderStatusDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.updateStatus(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Patch(':id/deliver')
  @Roles(Role.Admin, Role.Vendedor)
  deliver(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.deliver(req.user, id, selectedBranchId, devContextMode);
  }

  @Patch(':id/cancel')
  @Roles(Role.Admin)
  cancel(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: CancelOrderDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.cancel(req.user, id, body, selectedBranchId, devContextMode);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.ordersService.remove(req.user, id, selectedBranchId, devContextMode);
  }

}
