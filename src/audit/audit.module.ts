import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditOutboxService } from './audit-outbox.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditOutboxService, AuditInterceptor],
  exports: [AuditService, AuditOutboxService, AuditInterceptor],
})
export class AuditModule {}
