import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImageOptimizerService } from './image-optimizer.service';
import { SupabaseStorageService } from './supabase-storage.service';
import { PrismaModule } from '../prisma/prisma.module';
import { StoredFilesService } from './stored-files.service';
import { UploadQuotaService } from './upload-quota.service';
import { FileScanner, NoopFileScanner } from './file-scanner.interface';
import { ImageProcessingCoordinatorService } from './image-processing-coordinator.service';

@Module({
  imports: [SupabaseModule, PrismaModule],
  providers: [
    ImageOptimizerService,
    ImageProcessingCoordinatorService,
    StoredFilesService,
    UploadQuotaService,
    { provide: FileScanner, useClass: NoopFileScanner },
    SupabaseStorageService,
  ],
  exports: [
    ImageOptimizerService,
    ImageProcessingCoordinatorService,
    SupabaseStorageService,
    StoredFilesService,
    UploadQuotaService,
  ],
})
export class StorageModule {}
