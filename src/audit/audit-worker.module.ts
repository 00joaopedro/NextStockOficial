import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditOutboxService } from './audit-outbox.service';

@Module({ imports: [PrismaModule], providers: [AuditOutboxService] })
export class AuditWorkerModule {}
