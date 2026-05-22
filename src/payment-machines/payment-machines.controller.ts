import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreatePaymentMachineDto } from './dto/create-payment-machine.dto';
import { UpdatePaymentMachineDto } from './dto/update-payment-machine.dto';
import { PaymentMachinesService } from './payment-machines.service';

@Controller('payment-machines')
@UseGuards(OptionalJwtAuthGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class PaymentMachinesController {
  constructor(private readonly paymentMachinesService: PaymentMachinesService) {}

  @Get()
  list(@Req() req: Request) {
    return this.paymentMachinesService.list(req.user);
  }

  @Post()
  create(@Req() req: Request, @Body() body: CreatePaymentMachineDto) {
    return this.paymentMachinesService.create(req.user, body);
  }

  @Patch(':id')
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdatePaymentMachineDto,
  ) {
    return this.paymentMachinesService.update(req.user, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.paymentMachinesService.remove(req.user, id);
  }
}
