import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentMachinesController } from './payment-machines.controller';
import { PaymentMachinesService } from './payment-machines.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PaymentMachinesController],
  providers: [PaymentMachinesService],
})
export class PaymentMachinesModule {}
