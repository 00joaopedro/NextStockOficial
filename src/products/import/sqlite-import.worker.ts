import { parentPort, workerData } from 'node:worker_threads';
import { readDatabase } from './sqlite-import-reader';

const { path, table } = workerData as { path: string; table?: string };
try {
  parentPort?.postMessage({ ok: true, data: readDatabase(path, table) });
} catch {
  parentPort?.postMessage({ ok: false });
}
