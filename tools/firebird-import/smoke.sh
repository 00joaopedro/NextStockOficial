#!/usr/bin/env bash
set -euo pipefail
image=nextstock-firebird-import:ci
fixture=$(mktemp)
trap 'rm -f "$fixture"' EXIT

docker build -f tools/firebird-import/Dockerfile -t "$image" .
docker run --rm -i --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=96m \
  --entrypoint python "$image" - > "$fixture" <<'PY'
import sys
from decimal import Decimal
from pathlib import Path
from firebird.driver import create_database

path = Path("/tmp/source.fdb")
with create_database(path, user="SYSDBA", charset="UTF8") as db:
    cursor = db.cursor()
    cursor.execute('CREATE TABLE PRODUTOS (NOME VARCHAR(80), CODIGO VARCHAR(30), CUSTO DECIMAL(12,2))')
    db.commit()
    cursor.execute("INSERT INTO PRODUTOS VALUES (?, ?, ?)", ("Café", "000123", Decimal("12.50")))
    db.commit()
sys.stdout.buffer.write(path.read_bytes())
PY
chmod a+r "$fixture"
read_db() {
  timeout 30 docker run --rm --network none --read-only --cap-drop ALL \
    --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=96m \
    --memory 256m --cpus 1 --pids-limit 64 \
    --mount "type=bind,src=$fixture,dst=/input/source.fdb,readonly" "$image" "$@"
}
[[ "$(read_db)" == '{"tables": ["PRODUTOS"]}' ]]
[[ "$(read_db --table PRODUTOS)" == '{"columns": ["NOME", "CODIGO", "CUSTO"]}' ]]
diff -u <(printf 'NOME,CODIGO,CUSTO\nCafé,000123,12.50\n') \
  <(read_db --table PRODUTOS --column NOME --column CODIGO --column CUSTO | tr -d '\r')
if read_db --table PRODUTOS --column INEXISTENTE; then
  echo 'Coluna inexistente não foi rejeitada' >&2
  exit 1
fi
