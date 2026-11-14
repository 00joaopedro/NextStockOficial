import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

export const SQLITE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const signature = Buffer.from('SQLite format 3\0');
let readers = 0;

export type SqliteImportResult =
  | { tables: string[] }
  | { headers: string[]; rows: (string | null)[][] };

export async function inspectProductSqlite(
  buffer: Buffer | undefined,
  table?: string,
): Promise<SqliteImportResult> {
  if (
    !buffer ||
    buffer.length < 100 ||
    buffer.length > SQLITE_IMPORT_MAX_BYTES ||
    !buffer.subarray(0, signature.length).equals(signature)
  ) {
    throw new BadRequestException(
      'Selecione um arquivo SQLite válido de até 5 MB.',
    );
  }
  if (
    table !== undefined &&
    (typeof table !== 'string' ||
      !table ||
      table.length > 512 ||
      table.includes('\0'))
  ) {
    throw new BadRequestException('Tabela inválida.');
  }
  // A copied WAL database may be missing committed rows persisted only in the WAL.
  if (buffer[18] !== 1 || buffer[19] !== 1) {
    throw new BadRequestException(
      'Gere uma cópia SQLite independente, sem modo WAL, ou exporte para CSV.',
    );
  }
  if (readers >= 2)
    throw new ServiceUnavailableException(
      'Leitores ocupados. Tente novamente.',
    );
  readers++;
  let directory: string | undefined;
  let worker: Worker | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), 'nextstock-sqlite-'));
    const path = join(directory, 'source.sqlite');
    await writeFile(path, buffer, { mode: 0o600 });
    worker = new Worker(join(__dirname, 'sqlite-import.worker.js'), {
      workerData: { path, table },
      resourceLimits: { maxOldGenerationSizeMb: 64 },
    });
    const activeWorker = worker;
    return await new Promise<SqliteImportResult>((resolve, reject) => {
      const fail = () => {
        clearTimeout(timer);
        reject(
          new BadRequestException(
            'Não foi possível ler a base ou tabela SQLite. Confira os limites ou exporte os produtos para CSV.',
          ),
        );
      };
      const timer = setTimeout(fail, 8000);
      activeWorker.once('error', fail);
      activeWorker.once('exit', fail);
      activeWorker.once(
        'message',
        (message: { ok: false } | { ok: true; data: SqliteImportResult }) => {
          if (!message.ok) return fail();
          clearTimeout(timer);
          resolve(message.data);
        },
      );
    });
  } finally {
    try {
      if (worker) await worker.terminate();
      if (directory) await rm(directory, { recursive: true, force: true });
    } finally {
      readers--;
    }
  }
}
