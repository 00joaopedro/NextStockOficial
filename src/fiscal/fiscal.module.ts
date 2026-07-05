import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { SystemModule } from '../system/system.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FiscalController } from './fiscal.controller';
import { FiscalSequenceService } from './fiscal-sequence.service';
import { FiscalService } from './fiscal.service';
import { FiscalStorageService } from './fiscal-storage.service';
import { FiscalValidationService } from './fiscal-validation.service';
import { MockFiscalProvider } from './providers/mock-fiscal-provider';
import { CertificateCryptoService } from './certificate-crypto.service';
import { CertificateParserService } from './certificate-parser.service';
import { CertificateService } from './certificate.service';
import { CertificateStorageService } from './certificate-storage.service';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TenancyModule,
    SystemModule,
    StorageModule,
    SupabaseModule,
  ],
  controllers: [FiscalController],
  providers: [
    FiscalService,
    FiscalValidationService,
    FiscalSequenceService,
    FiscalStorageService,
    MockFiscalProvider,
    CertificateCryptoService,
    CertificateParserService,
    CertificateStorageService,
    CertificateService,
  ],
  exports: [FiscalService],
})
export class FiscalModule {}
