import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { ImageOptimizerService } from './image-optimizer.service';
import { SupabaseStorageService } from './supabase-storage.service';

@Module({
  imports: [SupabaseModule],
  providers: [ImageOptimizerService, SupabaseStorageService],
  exports: [ImageOptimizerService, SupabaseStorageService],
})
export class StorageModule {}
