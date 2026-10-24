import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { DevController } from './dev.controller';
import { DevUsageCalculatorService } from './dev-usage-calculator.service';
import { DevService } from './dev.service';
import { RailwayMetricsModule } from './railway-metrics.module';
import { ResourceSnapshotsService } from './resource-snapshots.service';
import { SupabaseMetricsService } from './supabase-metrics.service';

@Module({
  imports: [AuthModule, PrismaModule, RailwayMetricsModule, TenancyModule],
  controllers: [DevController],
  providers: [
    DevService,
    DevUsageCalculatorService,
    ResourceSnapshotsService,
    SupabaseMetricsService,
  ],
  exports: [DevService],
})
export class DevModule {}
