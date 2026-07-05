import { StoredFileScanStatus } from '@prisma/client';

export type FileScanInput = {
  mimeType: string;
  buffer: Buffer;
  originalName?: string | null;
};

export abstract class FileScanner {
  abstract classify(input: FileScanInput): Promise<StoredFileScanStatus>;
}

export class NoopFileScanner extends FileScanner {
  classify(input: FileScanInput) {
    return Promise.resolve(
      input.mimeType.startsWith('image/')
        ? StoredFileScanStatus.NOT_REQUIRED
        : StoredFileScanStatus.PENDING,
    );
  }
}
