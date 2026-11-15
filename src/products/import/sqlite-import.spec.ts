import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readDatabase } from './sqlite-import-reader';
import { inspectProductSqlite } from './sqlite-import';

describe('SQLite product source', () => {
  it('lists real tables and reads product identifiers as exact text', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nextstock-sqlite-test-'));
    try {
      const path = join(dir, 'fixture.db');
      const db = new DatabaseSync(path);
      try {
        db.exec(`
          CREATE TABLE "prod""utos" (nome TEXT, codigo TEXT, legado INTEGER);
          INSERT INTO "prod""utos" VALUES ('Café', '000123', 9223372036854775807);
          CREATE VIEW fake AS SELECT * FROM "prod""utos";
        `);
      } finally {
        db.close();
      }
      expect(readDatabase(path)).toEqual({ tables: ['prod"utos'] });
      expect(readDatabase(path, 'prod"utos')).toEqual({
        headers: ['nome', 'codigo', 'legado'],
        rows: [['Café', '000123', '9223372036854775807']],
      });
      expect(() => readDatabase(path, 'fake')).toThrow('unknown table');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a file that is not SQLite and a copy that still requires WAL', async () => {
    await expect(inspectProductSqlite(Buffer.alloc(100))).rejects.toThrow(
      'SQLite válido',
    );
    const wal = Buffer.alloc(100);
    wal.write('SQLite format 3\0');
    wal[18] = wal[19] = 2;
    await expect(inspectProductSqlite(wal)).rejects.toThrow('modo WAL');
  });
});
