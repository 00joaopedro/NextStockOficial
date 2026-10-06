import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrintQueue, PrinterTransport } from '../../scripts/printing/print-queue';

const wait = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('print queue restart recovery', () => {
  it('resumes persisted pending jobs after a new queue instance loads', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-recovery-test-'));
    const filePath = join(directory, 'queue.json');
    const now = new Date().toISOString();
    await mkdir(directory, { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify([
        {
          id: 'recovery-1',
          idempotencyKey: 'recovery-key',
          paperWidthMm: 58,
          html: '<p>Recuperar</p>',
          status: 'pending',
          attempts: 0,
          createdAt: now,
          updatedAt: now,
        },
      ]),
    );

    let sends = 0;
    const transport: PrinterTransport = {
      send: async () => {
        sends += 1;
        return { status: 'printed' };
      },
    };
    const queue = new PrintQueue(filePath, transport);
    await queue.get('recovery-1');
    await wait(80);

    expect(sends).toBe(1);
    expect((await queue.get('recovery-1'))?.status).toBe('printed');
    const saved = JSON.parse(await readFile(filePath, 'utf8')) as Array<{
      status: string;
    }>;
    expect(saved[0].status).toBe('printed');
    await rm(directory, { recursive: true, force: true });
  });

  it('falls back to the last atomic backup when the active file is invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-recovery-test-'));
    const filePath = join(directory, 'queue.json');
    const backup = [
      {
        id: 'backup-1',
        idempotencyKey: 'backup-key',
        paperWidthMm: 80,
        html: '<p>Backup</p>',
        status: 'printed',
        attempts: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    await writeFile(filePath, '{invalid');
    await writeFile(`${filePath}.bak`, JSON.stringify(backup));

    const queue = new PrintQueue(filePath, {
      send: async () => ({ status: 'printed' }),
    });
    expect((await queue.get('backup-1'))?.status).toBe('printed');
    await rm(directory, { recursive: true, force: true });
  });
});
