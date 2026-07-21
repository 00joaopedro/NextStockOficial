import {
  Controller,
  Get,
  Headers,
  Param,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import type { Request } from '../common/http-types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardFilterDto } from './dto/dashboard-filter.dto';
import { DashboardProductFilterDto } from './dto/dashboard-product-filter.dto';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true, allowedRoles: [Role.Admin, Role.Vendedor, Role.Comprador] })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getDashboard(
    @Req() req: Request,
    @Query() query: DashboardFilterDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getDashboard(req.user, query, selectedBranchId, devContextMode);
  }

  @Get('summary')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getSummary(
    @Req() req: Request,
    @Query() query: DashboardFilterDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getSummary(req.user, query, selectedBranchId, devContextMode);
  }

  @Get('charts')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getCharts(
    @Req() req: Request,
    @Query() query: DashboardFilterDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getCharts(req.user, query, selectedBranchId, devContextMode);
  }

  @Get('top-products')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getTopProducts(
    @Req() req: Request,
    @Query() query: DashboardFilterDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getTopProducts(req.user, query, selectedBranchId, devContextMode);
  }

  @Get('product/:productId')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getProduct(
    @Req() req: Request,
    @Param('productId') productId: string,
    @Query() query: DashboardProductFilterDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getProductMetrics(
      req.user,
      productId,
      query,
      selectedBranchId,
      devContextMode,
    );
  }

  @Get('alerts')
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  getAlerts(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.dashboardService.getAlerts(req.user, selectedBranchId, devContextMode);
  }
}
