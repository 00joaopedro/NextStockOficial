import { Readable } from 'node:stream';
import {
  StorageMetadata,
  StorageObject,
  StorageProvider,
  StorageProviderName,
} from './storage-provider';

export class FakeStorageProvider implements StorageProvider {
  constructor(readonly name: StorageProviderName = 'GCS') {}
  private readonly objects = new Map<
    string,
    { value: Buffer; metadata: StorageObject; generation: string }
  >();
  fault?: 'timeout' | 'corrupt' | 'unavailable';
  private key(locator: { bucket: string; objectKey: string }) {
    return `${locator.bucket}/${locator.objectKey}`;
  }
  async putObject(
    locator: { bucket: string; objectKey: string },
    body: NodeJS.ReadableStream | Buffer,
    metadata: StorageMetadata,
  ) {
    this.fail();
    const value = Buffer.isBuffer(body) ? body : await streamBuffer(body);
    const key = this.key(locator);
    const existing = this.objects.get(key);
    if (existing) throw new Error('STORAGE_OBJECT_EXISTS');
    const generation = '1';
    const result = {
      ...metadata,
      ...locator,
      provider: this.name,
      generation,
      sizeBytes: value.length,
    };
    this.objects.set(key, { value, metadata: result, generation });
    return result;
  }
  async getObjectStream(locator: { bucket: string; objectKey: string }) {
    this.fail();
    const item = this.objects.get(this.key(locator));
    if (!item) throw new Error('STORAGE_OBJECT_NOT_FOUND');
    return Readable.from(item.value);
  }
  async headObject(locator: { bucket: string; objectKey: string }) {
    this.fail();
    return this.objects.get(this.key(locator))?.metadata || null;
  }
  async deleteObject(locator: { bucket: string; objectKey: string }) {
    this.fail();
    this.objects.delete(this.key(locator));
  }
  async createSignedDownloadUrl(
    locator: { bucket: string; objectKey: string },
    ttlSeconds: number,
  ) {
    this.fail();
    if (!Number.isInteger(ttlSeconds) || ttlSeconds <= 0)
      throw new Error('STORAGE_TTL_INVALID');
    return `https://fake.invalid/${encodeURIComponent(locator.bucket)}/${encodeURIComponent(locator.objectKey)}?expires=${ttlSeconds}`;
  }
  async objectExists(locator: { bucket: string; objectKey: string }) {
    return Boolean(await this.headObject(locator));
  }
  private fail() {
    if (this.fault === 'timeout') throw new Error('STORAGE_PROVIDER_TIMEOUT');
    if (this.fault === 'unavailable')
      throw new Error('STORAGE_PROVIDER_UNAVAILABLE');
  }
}
async function streamBuffer(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
