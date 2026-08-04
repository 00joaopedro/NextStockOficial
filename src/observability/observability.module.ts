import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { HealthController } from './health.controller';
import { ObservabilityInterceptor } from './observability.interceptor';
import { ObservabilityService } from './observability.service';
import { SchemaCompatibilityService } from './schema-compatibility.service';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
  providers: [
    ObservabilityService,
    ObservabilityInterceptor,
    SchemaCompatibilityService,
  ],
  exports: [ObservabilityService, ObservabilityInterceptor],
})
export class ObservabilityModule {}
