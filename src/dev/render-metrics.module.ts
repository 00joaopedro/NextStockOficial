import { Module } from '@nestjs/common';
import { RenderMetricsService } from './render-metrics.service';

@Module({ providers: [RenderMetricsService], exports: [RenderMetricsService] })
export class RenderMetricsModule {}
