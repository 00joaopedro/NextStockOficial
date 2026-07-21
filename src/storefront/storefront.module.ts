import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BillingCoreModule } from '../billing/billing-core.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import {
  StorefrontAdminController,
  StorefrontPublicController,
} from './storefront.controller';
import { StorefrontService } from './storefront.service';
@Module({
  imports: [
    PrismaModule,
    TenancyModule,
    BillingCoreModule,
    StorageModule,
    AuditModule,
  ],
  controllers: [StorefrontAdminController, StorefrontPublicController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
