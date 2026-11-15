import { DatabaseSync } from 'node:sqlite';

export function readDatabase(path: string, table?: string) {
  const db = new DatabaseSync(path, {
    readOnly: true,
    allowExtension: false,
    enableDoubleQuotedStringLiterals: false,
  });
  try {
    db.exec('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON;');
    const tables = db
      .prepare(
        "SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND substr(name, 1, 7) <> 'sqlite_' ORDER BY name LIMIT 201",
      )
      .all()
      .map((row) => String(row.name));
    if (tables.length > 200) throw new Error('table limit');
    if (table === undefined) return { tables };
    if (!tables.includes(table)) throw new Error('unknown table');
    const headers = db
      .prepare(
        'SELECT name FROM pragma_table_xinfo(?, ?) WHERE hidden = 0 ORDER BY cid LIMIT 101',
      )
      .all(table, 'main')
      .map((row) => String(row.name));
    if (!headers.length || headers.length > 100)
      throw new Error('column limit');
    const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
    // Return TEXT instead of JS numbers: barcodes may exceed Number precision.
    // Blobs are not product fields. Oversize cells are rejected rather than cut.
    const columns = headers.map((name, i) => {
      const col = quote(name);
      return `CASE WHEN typeof(${col}) = 'blob' THEN NULL WHEN length(CAST(${col} AS BLOB)) > 4096 THEN 1 ELSE CAST(${col} AS TEXT) END AS c${i}`;
    });
    const statement = db.prepare(
      `SELECT ${columns.join(', ')} FROM main.${quote(table)} LIMIT 10001`,
    );
    const rows: (string | null)[][] = [];
    let size = 0;
    for (const row of statement.iterate()) {
      if (rows.length === 10000) throw new Error('row limit');
      const values = headers.map((_, i) => {
        const value = row[`c${i}`];
        if (value === null || typeof value === 'string') return value;
        throw new Error('cell limit');
      });
      size += Buffer.byteLength(JSON.stringify(values)) + 1;
      if (size > 8 * 1024 * 1024) throw new Error('output limit');
      rows.push(values);
    }
    return { headers, rows };
  } finally {
    db.close();
  }
}
