import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import {
  PrintQueue,
  SimulatedPrinterTransport,
  PrinterTransport,
  PrintJob,
  UnknownPrintError,
} from './print-queue';

const port = Number(process.env.NEXTSTOCK_PRINT_AGENT_PORT || 17890);
const token = process.env.NEXTSTOCK_PRINT_AGENT_TOKEN;
if (!token) throw new Error('NEXTSTOCK_PRINT_AGENT_TOKEN is required.');
const allowedOrigins = new Set(
  (
    process.env.NEXTSTOCK_PRINT_AGENT_ORIGINS ||
    'https://nextstocks.online,https://www.nextstocks.online,http://localhost'
  )
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);

class WindowsShareTransport implements PrinterTransport {
  async send(payload: Buffer, job: PrintJob) {
    if (process.platform !== 'win32')
      throw new Error('Windows spooler transport requires Windows.');
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    const { execFile } = await import('node:child_process');
    const share = process.env.NEXTSTOCK_PRINTER_SHARE;
    if (!share) throw new Error('NEXTSTOCK_PRINTER_SHARE is required.');
    const directory = await mkdtemp(path.join(tmpdir(), 'nextstock-print-'));
    const file = path.join(directory, `${job.id}.bin`);
    try {
      await writeFile(file, payload);
      await new Promise<void>((resolve, reject) =>
        execFile('cmd.exe', ['/c', 'copy', '/b', file, share], (error) =>
          error
            ? reject(new UnknownPrintError(error instanceof Error ? error.message : String(error)))
            : resolve(),
        ),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
}

const queueFile =
  process.env.NEXTSTOCK_PRINT_QUEUE_FILE || './.nextstock-print/queue.json';
const transport: PrinterTransport =
  process.env.NEXTSTOCK_PRINTER_MODE === 'windows'
    ? new WindowsShareTransport()
    : new SimulatedPrinterTransport(
        process.env.NEXTSTOCK_SIMULATED_PRINTER_DIR ||
          './.nextstock-print/output',
      );
const queue = new PrintQueue(queueFile, transport);

function authorized(req: IncomingMessage) {
  return req.headers.authorization === `Bearer ${token}`;
}
function corsHeaders(req: IncomingMessage) {
  const origin =
    typeof req.headers.origin === 'string' &&
    allowedOrigins.has(req.headers.origin)
      ? req.headers.origin
      : undefined;
  return {
    'content-type': 'application/json',
    ...(origin
      ? { 'access-control-allow-origin': origin, vary: 'Origin' }
      : {}),
    'access-control-allow-headers': 'authorization,content-type',
  };
}
function json(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  value: unknown,
) {
  res.writeHead(status, corsHeaders(req));
  res.end(JSON.stringify(value));
}
async function body(req: IncomingMessage) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  if (raw.length > 2_000_000) throw new Error('Payload too large.');
  return JSON.parse(raw || '{}') as Record<string, unknown>;
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (!authorized(req))
    return json(req, res, 401, {
      error: 'Unauthorized local print agent request.',
    });
  try {
    if (req.method === 'POST' && req.url === '/v1/print') {
      const input = await body(req);
      const width = Number(input.paperWidthMm);
      if (
        ![58, 80].includes(width) ||
        typeof input.idempotencyKey !== 'string' ||
        typeof input.html !== 'string'
      )
        return json(req, res, 400, {
          error: 'idempotencyKey, html and paperWidthMm (58/80) are required.',
        });
      return json(req, res, 202, {
        job: await queue.enqueue({
          idempotencyKey: input.idempotencyKey,
          html: input.html,
          paperWidthMm: width as 58 | 80,
        }),
      });
    }
    const resolveMatch = req.url?.match(/^\/v1\/jobs\/([^/]+)\/resolve$/);
    if (req.method === 'POST' && resolveMatch) {
      const input = await body(req);
      const resolution = input.resolution;
      if (
        resolution !== 'confirm_not_printed' &&
        resolution !== 'confirm_printed' &&
        resolution !== 'cancel'
      ) {
        return json(req, res, 400, { error: 'Invalid print resolution.' });
      }
      return json(req, res, 200, {
        job: await queue.resolve(resolveMatch[1], resolution),
      });
    }
    const match = req.url?.match(/^\/v1\/jobs\/([^/]+)$/);
    if (req.method === 'GET' && match)
      return json(req, res, 200, { job: await queue.get(match[1]) });
    return json(req, res, 404, { error: 'Not found.' });
  } catch (error) {
    return json(req, res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

createServer((req, res) => {
  void handleRequest(req, res);
}).listen(port, '127.0.0.1', () => {
  void mkdir('./.nextstock-print', { recursive: true })
    .then(() => {
      console.log(`NextStock print agent listening on 127.0.0.1:${port}`);
    })
    .catch((error: unknown) => {
      console.error('Unable to initialize print agent storage.', error);
    });
});
