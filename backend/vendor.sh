#!/usr/bin/env bash
# Importa lo strato di protocollo Mercedes da mbapi2020 (MIT).
#
# Ri-eseguibile: per aggiornare alla versione upstream piu' recente basta
# rilanciare lo script. I file vengono copiati senza modifiche a parte la
# riscrittura degli import assoluti (custom_components.mbapi2020.x -> .x),
# cosi' il diff verso upstream resta leggibile.
#
# Le dipendenze da Home Assistant NON vengono rimosse: sono soddisfatte a
# runtime da app/ha_compat.py, che registra moduli finti in sys.modules.
set -euo pipefail

UPSTREAM="https://github.com/ReneNulschDE/mbapi2020.git"
REF="${1:-master}"
DEST="$(cd "$(dirname "$0")" && pwd)/app/mbapi"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Clono $UPSTREAM ($REF)..."
git clone --depth 1 --branch "$REF" "$UPSTREAM" "$TMP/src" >/dev/null 2>&1
SRC="$TMP/src/custom_components/mbapi2020"

rm -rf "$DEST/proto"
mkdir -p "$DEST/proto"
# I pb2 generati si importano fra loro con path assoluto.
for f in "$SRC"/proto/*.py; do
    sed -E 's/^import custom_components\.mbapi2020\.proto\.([a-z0-9_]+) as /from . import \1 as /' \
        "$f" > "$DEST/proto/$(basename "$f")"
done
[ -f "$DEST/proto/__init__.py" ] || touch "$DEST/proto/__init__.py"

for f in oauth.py websocket.py helper.py app_version.py errors.py proto_diag.py const.py; do
    sed -E 's/^from custom_components\.mbapi2020\.([a-z0-9_]+) import/from .\1 import/' \
        "$SRC/$f" > "$DEST/$f"
done

# La licenza MIT richiede di conservare la nota di copyright.
cp "$TMP/src/LICENSE" "$DEST/LICENSE.upstream"

git -C "$TMP/src" rev-parse HEAD > "$DEST/UPSTREAM_REV"
echo "Fatto. Revisione upstream: $(cat "$DEST/UPSTREAM_REV")"
