#!/usr/bin/env sh
set -eu

printf '\n[novel-tool] Setup Termux environment\n'
command -v node >/dev/null 2>&1 || { echo 'Node.js not found. Run: pkg install nodejs'; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm not found. Run: pkg install nodejs'; exit 1; }

mkdir -p apps/api-legacy/storage
cp -n apps/api-legacy/.env.termux.example apps/api-legacy/.env 2>/dev/null || cp -n apps/api-legacy/.env.example apps/api-legacy/.env 2>/dev/null || true
npm ci --registry=https://registry.npmjs.org/
printf '\nDone. Start dev server with:\n  npm run dev:termux\n\nOpen:\n  Web: http://127.0.0.1:5173\n  API: http://127.0.0.1:3000/health\n'
