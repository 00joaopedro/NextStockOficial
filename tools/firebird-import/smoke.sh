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

# The hosted surface must consume the same fixture without an exposed port.
container=$(docker run --rm -d --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --tmpfs /tmp:rw,noexec,nosuid,size=96m \
  --memory 256m --cpus 1 --pids-limit 64 \
  -e NEXTSTOCK_FIREBIRD_READER_TOKEN=ci-firebird-fixture-token-only-123456 \
  --mount "type=bind,src=$fixture,dst=/input/source.fdb,readonly" \
  --entrypoint python "$image" /tool/server.py)
trap 'docker rm -f "$container" >/dev/null 2>&1 || true; rm -f "$fixture"' EXIT
docker exec -i "$container" python - <<'PY'
import json
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

data = Path("/input/source.fdb").read_bytes()
origin = "http://127.0.0.1:8080/inspect"
headers = {"Authorization": "Bearer ci-firebird-fixture-token-only-123456"}
for _ in range(20):
    try:
        with urlopen(Request(origin, data=data, headers=headers), timeout=3) as result:
            assert json.load(result) == {"tables": ["PRODUTOS"]}
        break
    except URLError as error:
        if isinstance(error, HTTPError):
            raise
        time.sleep(0.25)
else:
    raise AssertionError("Reader did not start")
with urlopen(Request(origin + "?table=PRODUTOS", data=data, headers=headers), timeout=10) as result:
    assert json.load(result) == {"headers": ["NOME", "CODIGO", "CUSTO"], "rows": [["Café", "000123", "12.50"]]}
try:
    urlopen(Request(origin, data=b"invalid", headers=headers), timeout=10)
except HTTPError as error:
    assert error.code == 422
else:
    raise AssertionError("Invalid file was accepted")
try:
    urlopen(Request(origin, data=data), timeout=10)
except HTTPError as error:
    assert error.code == 401
else:
    raise AssertionError("Unauthenticated request was accepted")
PY
