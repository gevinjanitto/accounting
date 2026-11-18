#!/usr/bin/env bash
# Membuat paket upload cPanel: dist-cpanel/frontend.zip (isi public_html) dan dist-cpanel/backend.zip (folder aplikasi Python).
# Pemakaian: API_URL=https://api.domainanda.com bash scripts/build_cpanel.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${API_URL:?Isi API_URL, contoh: API_URL=https://api.domainanda.com bash scripts/build_cpanel.sh}"
OUT="$ROOT/dist-cpanel"
rm -rf "$OUT" && mkdir -p "$OUT"
echo "==> Build frontend (REACT_APP_BACKEND_URL=$API_URL)"
(cd "$ROOT/frontend" && [ -d node_modules ] || (cd "$ROOT/frontend" && yarn install))
(cd "$ROOT/frontend" && REACT_APP_BACKEND_URL="$API_URL" GENERATE_SOURCEMAP=false yarn build)
(cd "$ROOT/frontend/build" && zip -qr "$OUT/frontend.zip" . -x 'setup.sh')
echo "==> Paket backend"
(cd "$ROOT/backend" && zip -qr "$OUT/backend.zip" . -x '.env' '.venv/*' '__pycache__/*' '*/__pycache__/*' 'uploads/*' 'tests/*' '.pytest_cache/*')
cp "$ROOT/backend/.env.cpanel.example" "$OUT/env-backend.txt"
echo "Selesai:"
echo "  $OUT/frontend.zip  -> ekstrak ke public_html (atau document root domain)"
echo "  $OUT/backend.zip   -> ekstrak ke ~/maiharta-api (Application root Setup Python App)"
echo "  $OUT/env-backend.txt -> contoh isi backend/.env di server"
