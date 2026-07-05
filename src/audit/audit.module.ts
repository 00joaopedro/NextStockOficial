import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}
