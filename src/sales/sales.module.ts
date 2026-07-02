import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SystemModule } from '../system/system.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { InternalReceiptService } from './internal-receipt.service';
import { Model65DecisionService } from './model65-decision.service';
import { NfceAttemptService } from './nfce-attempt.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenancyModule,
    SystemModule,
    StorageModule,
    FiscalModule,
  ],
  controllers: [SalesController],
  providers: [
    SalesService,
    InternalReceiptService,
    Model65DecisionService,
    NfceAttemptService,
  ],
  exports: [SalesService],
})
export class SalesModule {}
