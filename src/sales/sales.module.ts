import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SystemModule } from '../system/system.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

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
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
