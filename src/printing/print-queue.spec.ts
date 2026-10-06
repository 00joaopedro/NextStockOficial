import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PrintQueue,
  PrinterTransport,
  UnknownPrintError,
} from '../../scripts/printing/print-queue';
import { columnsFor, encodeEscPos, htmlToReceiptText } from '../../scripts/printing/escpos';

describe('local thermal print queue', () => {
  it('wraps receipt text and emits ESC/POS initialization and cut bytes', () => {
    const text = htmlToReceiptText('<h1>Produto muito longo para teste</h1>', 58);
    const payload = encodeEscPos(text, 58);
    expect(columnsFor(58)).toBe(32);
    expect(text).toContain('Produto');
    expect(payload[0]).toBe(0x1b);
    expect(payload[payload.length - 2]).toBe(0x56);
    expect(payload[payload.length - 1]).toBe(0x00);
  });

  it('deduplicates the same idempotency key and persists printed status', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-print-test-'));
    const sent: Buffer[] = [];
    const transport: PrinterTransport = { send: async (payload) => { sent.push(payload); } };
    const queue = new PrintQueue(join(directory, 'queue.json'), transport);
    const first = await queue.enqueue({ idempotencyKey: 'sale-1-print-1', html: '<p>Total</p>', paperWidthMm: 80 });
    const second = await queue.enqueue({ idempotencyKey: 'sale-1-print-1', html: '<p>Total</p>', paperWidthMm: 80 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(second.id).toBe(first.id);
    expect(sent).toHaveLength(1);
    expect((await queue.get(first.id))?.status).toBe('printed');
    expect(JSON.parse(await readFile(join(directory, 'queue.json'), 'utf8'))[0].status).toBe('printed');
    await rm(directory, { recursive: true, force: true });
  });

  it('persists spooler acceptance and job identity while monitoring', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-print-test-'));
    const queue = new PrintQueue(join(directory, 'queue.json'), {
      send: async () => ({ status: 'spooled', spoolerJobId: 'job-42' }),
      query: async () => ({ status: 'printed' }),
    });
    const job = await queue.enqueue({
      idempotencyKey: 'spooled-1',
      html: '<p>Teste</p>',
      paperWidthMm: 80,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const stored = await queue.get(job.id);
    expect(stored?.status).toBe('spooled');
    expect(stored?.spoolerJobId).toBe('job-42');
    await rm(directory, { recursive: true, force: true });
  });

  it('retries transport failures and ends in error after the configured limit', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-print-test-'));
    let attempts = 0;
    const queue = new PrintQueue(join(directory, 'queue.json'), { send: async () => { attempts += 1; throw new Error('offline'); } }, 2);
    const job = await queue.enqueue({ idempotencyKey: 'failure-1', html: '<p>Teste</p>', paperWidthMm: 58 });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(attempts).toBe(2);
    expect((await queue.get(job.id))?.status).toBe('error');
    await rm(directory, { recursive: true, force: true });
  });
  it('pauses ambiguous transport failures without automatic retry', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-print-test-'));
    let attempts = 0;
    const queue = new PrintQueue(
      join(directory, 'queue.json'),
      {
        send: async () => {
          attempts += 1;
          throw new UnknownPrintError('spooler response lost');
        },
      },
      3,
    );
    const job = await queue.enqueue({
      idempotencyKey: 'unknown-1',
      html: '<p>Teste</p>',
      paperWidthMm: 80,
    });
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(attempts).toBe(1);
    expect((await queue.get(job.id))?.status).toBe('unknown');
    await queue.resolve(job.id, 'confirm_printed');
    expect((await queue.get(job.id))?.status).toBe('printed');
    await rm(directory, { recursive: true, force: true });
  });

});
