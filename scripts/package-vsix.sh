#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm 未安装" >&2
  exit 1
fi

npm install
npm run package

echo
echo "VSIX 已生成："
ls -1 "$ROOT"/*.vsix
