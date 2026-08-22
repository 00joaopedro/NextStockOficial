import { Readable } from 'node:stream';

export type StorageProviderName = 'SUPABASE' | 'GCS';
export type StorageLocator = { provider: StorageProviderName; bucket: string; objectKey: string; generation?: string };
export type StorageMetadata = { contentType?: string; sizeBytes?: number; sha256?: string; providerChecksum?: string; metadata?: Record<string, string> };
export type StorageObject = StorageLocator & StorageMetadata;

export interface StorageProvider {
  readonly name: StorageProviderName;
  putObject(locator: Omit<StorageLocator, 'provider'>, body: NodeJS.ReadableStream | Buffer, metadata: StorageMetadata): Promise<StorageObject>;
  getObjectStream(locator: Omit<StorageLocator, 'provider'>): Promise<Readable>;
  headObject(locator: Omit<StorageLocator, 'provider'>): Promise<StorageObject | null>;
  deleteObject(locator: Omit<StorageLocator, 'provider'>): Promise<void>;
  createSignedDownloadUrl(locator: Omit<StorageLocator, 'provider'>, ttlSeconds: number): Promise<string>;
  objectExists(locator: Omit<StorageLocator, 'provider'>): Promise<boolean>;
}
