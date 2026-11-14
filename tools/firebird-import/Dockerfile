FROM python:3.11-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends firebird3.0-server-core libfbclient2 \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir firebird-driver==2.0.3
WORKDIR /tool
COPY tools/firebird-import/export.py ./
COPY tools/firebird-import/firebird.conf /tool/firebird.conf
RUN set -eu; \
    engine="$(find /usr/lib -path '*/firebird/3.0/plugins/libEngine12.so' -print -quit)"; \
    test -n "$engine"; \
    root="$(dirname "$(dirname "$engine")")"; \
    cp /tool/firebird.conf /etc/firebird/3.0/firebird.conf; \
    if [ "$(readlink -f "$root/firebird.conf")" != /etc/firebird/3.0/firebird.conf ]; then cp /tool/firebird.conf "$root/firebird.conf"; fi; \
    rm -f "$root/plugins/libudr_engine.so"
ENV PYTHONDONTWRITEBYTECODE=1
USER 1000:1000
ENTRYPOINT ["python", "/tool/export.py"]
