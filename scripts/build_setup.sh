#!/usr/bin/env bash
# Membuat setup.sh = scripts/setup_head.sh + payload base64 (tar.gz seluruh file project).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/setup.sh}"
cd "$ROOT"
{
  cat scripts/setup_head.sh
  echo "__PAYLOAD_BELOW__"
  tar --exclude='./frontend/node_modules' --exclude='./frontend/build' --exclude='./backend/.venv' --exclude='./backend/.env' \
      --exclude='./frontend/.env' --exclude='./frontend/plugins' --exclude='*/__pycache__' --exclude='./.git' --exclude='./setup.sh' --exclude='./frontend/public/setup.sh' --exclude='./test_reports' \
      --exclude='./.emergent' --exclude='./memory' --exclude='./tests' --exclude='./test_result.md' --exclude='./.pytest_cache' \
      --exclude='./backend/.pytest_cache' --exclude='./design_guidelines.json' --exclude='./.mariadb-data' --exclude='./.ruff_cache' --exclude='./backend/tests' --exclude='./backend/uploads' --exclude='./test_result.md' -czf - . | base64
} > "$OUT"
chmod +x "$OUT"
echo "setup.sh dibuat: $OUT ($(du -h "$OUT" | cut -f1))"
