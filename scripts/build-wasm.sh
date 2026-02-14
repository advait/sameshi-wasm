#!/usr/bin/env bash
set -euo pipefail

EMSDK_ROOT="${EMSDK_ROOT:-/tmp/emsdk}"

if command -v emcc >/dev/null 2>&1; then
  make -C upstream wasm
  exit 0
fi

if [ -f "${EMSDK_ROOT}/emsdk_env.sh" ]; then
  # shellcheck disable=SC1090
  source "${EMSDK_ROOT}/emsdk_env.sh" >/dev/null
  make -C upstream wasm
  exit 0
fi

echo "emcc not found and ${EMSDK_ROOT}/emsdk_env.sh is missing" >&2
exit 1
