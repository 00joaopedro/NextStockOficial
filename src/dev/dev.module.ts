import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DevController } from './dev.controller';
import { DevService } from './dev.service';
import { RailwayMetricsService } from './railway-metrics.service';
import { SupabaseMetricsService } from './supabase-metrics.service';

@Module({
  imports: [PrismaModule],
  controllers: [DevController],
  providers: [DevService, RailwayMetricsService, SupabaseMetricsService],
  exports: [DevService],
})
export class DevModule {}
