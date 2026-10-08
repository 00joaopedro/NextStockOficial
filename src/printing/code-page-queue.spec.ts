import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrintQueue } from '../../scripts/printing/print-queue';

describe('configured print code page', () => {
  it('passes CP850 selection from the queue to ESC/POS encoding', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nextstock-code-page-test-'));
    let payload: Buffer | undefined;
    const queue = new PrintQueue(
      join(directory, 'queue.json'),
      {
        send: async (value) => {
          payload = value;
          return { status: 'printed' };
        },
      },
      3,
      'cp850',
    );

    await queue.enqueue({
      idempotencyKey: 'cp850-test',
      html: '<p>Promoções</p>',
      paperWidthMm: 80,
    });
    await queue.waitForIdle();

    expect(payload?.subarray(0, 5)).toEqual(
      Buffer.from([0x1b, 0x40, 0x1b, 0x74, 0x02]),
    );
    await rm(directory, { recursive: true, force: true });
  });
});
