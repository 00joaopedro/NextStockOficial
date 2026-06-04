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
import type { Request } from 'express';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PreviewMutationGuard } from '../system/guards/preview-mutation.guard';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';
import { PaymentMachinesService } from './payment-machines.service';

@Controller('payment-machines')
@UseGuards(JwtAuthGuard, RolesGuard, PreviewMutationGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PaymentMachinesController {
  constructor(private readonly paymentMachinesService: PaymentMachinesService) {}

  @Get()
  list(
    @Req() req: Request,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.paymentMachinesService.list(req.user, selectedBranchId);
  }

  @Post()
  @Roles(Role.Admin)
  create(
    @Req() req: Request,
    @Body() body: CreatePaymentMachineDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.paymentMachinesService.create(req.user, body, selectedBranchId);
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdatePaymentMachineDto,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.paymentMachinesService.update(req.user, id, body, selectedBranchId);
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(
    @Req() req: Request,
    @Param('id') id: string,
    @Headers('x-nextstock-branch-id') selectedBranchId?: string,
  ) {
    return this.paymentMachinesService.remove(req.user, id, selectedBranchId);
  }
}
