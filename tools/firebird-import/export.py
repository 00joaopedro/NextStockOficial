"""Extract selected scalar columns from a Firebird 3 compatible local copy."""
import argparse
import csv
import io
import json
import os
import shutil
import sys
import tempfile
from contextlib import closing
from pathlib import Path

MAX_BYTES = 64 * 1024 * 1024
MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10_000

TABLES = """
SELECT TRIM(RDB$RELATION_NAME)
FROM RDB$RELATIONS
WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0
  AND RDB$RELATION_TYPE = 0 AND RDB$EXTERNAL_FILE IS NULL
ORDER BY RDB$RELATION_NAME ROWS 201
"""
COLUMNS = """
SELECT TRIM(RF.RDB$FIELD_NAME)
FROM RDB$RELATION_FIELDS RF
JOIN RDB$FIELDS F ON F.RDB$FIELD_NAME = RF.RDB$FIELD_SOURCE
WHERE RF.RDB$RELATION_NAME = ? AND F.RDB$COMPUTED_BLR IS NULL
  AND COALESCE(F.RDB$DIMENSIONS, 0) = 0
  AND F.RDB$FIELD_TYPE IN (7, 8, 10, 14, 16, 27, 37)
ORDER BY RF.RDB$FIELD_POSITION ROWS 101
"""


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def collect(cursor, table, columns, include_rows=False):
    cursor.execute(TABLES)
    tables = [row[0] for row in cursor.fetchall()]
    if len(tables) > 200:
        raise ValueError("A base excede o limite de 200 tabelas.")
    if table is None:
        return json.dumps({"tables": tables}, ensure_ascii=False)
    if table not in tables:
        raise ValueError("Escolha uma tabela de dados listada pelo conversor.")
    cursor.execute(COLUMNS, (table,))
    names = [row[0] for row in cursor.fetchall()]
    if not names or len(names) > 100:
        raise ValueError("A tabela precisa ter entre 1 e 100 colunas compatíveis.")
    if include_rows:
        columns = names
    if not columns:
        return json.dumps({"columns": names}, ensure_ascii=False)
    if len(columns) > (100 if include_rows else 30) or len(set(columns)) != len(columns) or not set(columns) <= set(names):
        raise ValueError("Escolha até 30 colunas distintas listadas pelo conversor.")

    projection = ", ".join(identifier(name) for name in columns)
    cursor.execute(f"SELECT {projection} FROM {identifier(table)} ROWS {MAX_ROWS + 1}")
    output = io.StringIO(newline="")
    line = io.StringIO(newline="")
    writer = csv.writer(line)
    size = 0

    def write_row(row):
        nonlocal size
        line.seek(0)
        line.truncate()
        writer.writerow(row)
        value = line.getvalue()
        size += len(value.encode("utf-8"))
        if size > MAX_CSV_BYTES:
            raise ValueError("O CSV excede 5 MB. Divida a exportação na origem.")
        output.write(value)

    write_row(columns)
    for index, row in enumerate(cursor, 1):
        if index > MAX_ROWS:
            raise ValueError("A tabela excede 10.000 linhas. Divida a exportação na origem.")
        write_row(row)
    return output.getvalue()


def main():
    from firebird.driver import Isolation, TraAccessMode, connect, tpb

    parser = argparse.ArgumentParser()
    parser.add_argument("--table")
    parser.add_argument("--web", action="store_true")
    parser.add_argument("--column", action="append", default=[])
    args = parser.parse_args()
    if args.column and args.table is None:
        parser.error("--column exige --table")
    source = Path("source.fdb").resolve() if args.web else Path("/input/source.fdb")
    if not source.is_file() or not 0 < source.stat().st_size <= MAX_BYTES:
        raise ValueError("Disponibilize uma cópia Firebird .fdb de até 64 MB.")
    with tempfile.TemporaryDirectory(prefix="nextstock-firebird-") as directory:
        target = Path(directory) / "copy.fdb"
        shutil.copyfile(source, target)
        os.chmod(target, 0o600)
        with closing(connect(target, user="SYSDBA", charset="UTF8", no_gc=True, no_db_triggers=True)) as db:
            db.begin(tpb(Isolation.SNAPSHOT, access_mode=TraAccessMode.READ))
            with closing(db.cursor()) as cursor:
                result = collect(cursor, args.table, args.column, include_rows=args.web and args.table is not None)
            db.rollback()
    sys.stdout.write(result)


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(error, file=sys.stderr)
        sys.exit(2)
    except Exception:
        print("Não foi possível abrir a cópia Firebird. Confira a versão, a integridade e a codificação ou exporte CSV pelo sistema legado.", file=sys.stderr)
        sys.exit(1)
