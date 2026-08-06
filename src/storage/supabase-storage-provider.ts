import { Readable } from 'node:stream';
import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StorageMetadata, StorageObject, StorageProvider } from './storage-provider';

@Injectable()
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = 'SUPABASE' as const;
  constructor(private readonly supabase: SupabaseService) {}
  async putObject(locator: { bucket: string; objectKey: string }, body: NodeJS.ReadableStream | Buffer, metadata: StorageMetadata): Promise<StorageObject> {
    const value = Buffer.isBuffer(body) ? body : await bufferStream(body);
    const { error } = await this.supabase.admin.storage.from(locator.bucket).upload(locator.objectKey, value, { contentType: metadata.contentType, upsert: false });
    if (error) throw new Error('STORAGE_UPLOAD_FAILED');
    return { ...locator, ...metadata, provider: 'SUPABASE', sizeBytes: value.length };
  }
  async getObjectStream(locator: { bucket: string; objectKey: string }) { const { data, error } = await this.supabase.admin.storage.from(locator.bucket).download(locator.objectKey); if (error || !data) throw new Error('STORAGE_OBJECT_NOT_FOUND'); return Readable.from(Buffer.from(await data.arrayBuffer())); }
  async headObject(locator: { bucket: string; objectKey: string }) { return (await this.objectExists(locator)) ? { ...locator, provider: 'SUPABASE' as const } : null; }
  async deleteObject(locator: { bucket: string; objectKey: string }) { const { error } = await this.supabase.admin.storage.from(locator.bucket).remove([locator.objectKey]); if (error) throw new Error('STORAGE_DELETE_FAILED'); }
  async createSignedDownloadUrl(locator: { bucket: string; objectKey: string }, ttlSeconds: number) { if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0) throw new Error('STORAGE_TTL_INVALID'); const { data, error } = await this.supabase.admin.storage.from(locator.bucket).createSignedUrl(locator.objectKey, ttlSeconds); if (error || !data?.signedUrl) throw new Error('STORAGE_SIGNED_URL_FAILED'); return data.signedUrl; }
  async objectExists(locator: { bucket: string; objectKey: string }) { const { data, error } = await this.supabase.admin.storage.from(locator.bucket).list(locator.objectKey.split('/').slice(0, -1).join('/')); if (error) throw new Error('STORAGE_HEAD_FAILED'); return data.some((item) => item.name === locator.objectKey.split('/').pop()); }
}
async function bufferStream(stream: NodeJS.ReadableStream) { const chunks: Buffer[] = []; for await (const chunk of stream as AsyncIterable<Buffer | string>) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); return Buffer.concat(chunks); }
