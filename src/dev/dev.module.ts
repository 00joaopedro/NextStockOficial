import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DevController } from './dev.controller';
import { DevUsageCalculatorService } from './dev-usage-calculator.service';
import { DevService } from './dev.service';
import { RailwayMetricsService } from './railway-metrics.service';
import { ResourceSnapshotsService } from './resource-snapshots.service';
import { SupabaseMetricsService } from './supabase-metrics.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DevController],
  providers: [
    DevService,
    DevUsageCalculatorService,
    RailwayMetricsService,
    ResourceSnapshotsService,
    SupabaseMetricsService,
  ],
  exports: [DevService],
})
export class DevModule {}
