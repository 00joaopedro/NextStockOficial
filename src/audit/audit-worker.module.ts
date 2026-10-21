import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditOutboxService } from './audit-outbox.service';
import { SupabaseModule } from '../supabase/supabase.module';
import { CertificateCleanupService } from '../fiscal/certificate-cleanup.service';
import { CertificateStorageService } from '../fiscal/certificate-storage.service';

@Module({
  imports: [PrismaModule, SupabaseModule],
  providers: [
    AuditOutboxService,
    CertificateStorageService,
    CertificateCleanupService,
  ],
})
export class AuditWorkerModule {}
