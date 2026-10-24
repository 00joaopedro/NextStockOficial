import { Module } from '@nestjs/common';
import { RailwayMetricsService } from './railway-metrics.service';

// Kept independent from DevModule so billing can consume provider metrics
// without traversing AuthModule and creating a BillingCoreModule cycle.
@Module({
  providers: [RailwayMetricsService],
  exports: [RailwayMetricsService],
})
export class RailwayMetricsModule {}
