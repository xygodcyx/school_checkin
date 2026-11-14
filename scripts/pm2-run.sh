#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_ROOT"

if [[ -n "${BUN_BIN:-}" ]]; then
  exec "$BUN_BIN" run src/main.ts
fi

exec bun run src/main.ts
