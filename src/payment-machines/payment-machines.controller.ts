import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from '../common/http-types';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { BranchContextGuard } from '../tenancy/branch-context.guard';
import { RequireTenantContext } from '../tenancy/tenant-context.decorator';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';
import { PaymentMachinesService } from './payment-machines.service';

@Controller('payment-machines')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard, BranchContextGuard)
@RequireTenantContext({ requireBranch: true })
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PaymentMachinesController {
  constructor(private readonly paymentMachinesService: PaymentMachinesService) {}

  @Get()
  @Roles(Role.Admin, Role.Vendedor, Role.Comprador)
  list(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.paymentMachinesService.list(
      req.user,
      selectedBranchId,
      devContextMode,
    );
  }

  @Post()
  @Roles(Role.Admin)
  create(
    @Req() req: Request,
    @Body() body: CreatePaymentMachineDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.paymentMachinesService.create(
      req.user,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdatePaymentMachineDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.paymentMachinesService.update(
      req.user,
      id,
      body,
      selectedBranchId,
      devContextMode,
    );
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
    @Headers('x-nextstock-dev-context') devContextMode?: string,
  ) {
    return this.paymentMachinesService.remove(
      req.user,
      id,
      selectedBranchId,
      devContextMode,
    );
  }
}
