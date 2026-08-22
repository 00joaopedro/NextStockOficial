import { Inject, Injectable } from '@nestjs/common';
import { StorageProvider, StorageProviderName } from './storage-provider';
import {
  GCS_STORAGE_PROVIDER,
  SUPABASE_STORAGE_PROVIDER,
} from './storage-provider.tokens';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

@Injectable()
export class StorageProviderRegistry {
  constructor(
    @Inject(SUPABASE_STORAGE_PROVIDER)
    private readonly supabase: StorageProvider,
    @Inject(GCS_STORAGE_PROVIDER)
    private readonly gcs: StorageProvider,
  ) {}
  writeProvider(env: NodeJS.ProcessEnv = process.env): StorageProviderName {
    const value = (env.STORAGE_WRITE_PROVIDER || 'supabase').toUpperCase();
    if (value !== 'SUPABASE' && value !== 'GCS')
      throw new Error('STORAGE_WRITE_PROVIDER_INVALID');
    if (value === 'GCS' && env.GCS_STORAGE_ENABLED !== 'true')
      throw new Error('GCS_STORAGE_DISABLED');
    return value as StorageProviderName;
  }
  provider(name: StorageProviderName) {
    return name === 'GCS' ? this.gcs : this.supabase;
  }
}
