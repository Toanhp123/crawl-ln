#!/usr/bin/env sh
set -eu

printf '\n[novel-tool] Termux development server\n'
command -v node >/dev/null 2>&1 || { echo 'Node.js not found. Run: pkg install nodejs'; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm not found. Run: pkg install nodejs'; exit 1; }

mkdir -p apps/api-legacy/storage
if [ ! -f apps/api-legacy/.env ]; then
  if [ -f apps/api-legacy/.env.termux.example ]; then
    cp apps/api-legacy/.env.termux.example apps/api-legacy/.env
  else
    cp apps/api-legacy/.env.example apps/api-legacy/.env
  fi
  printf '[novel-tool] Created apps/api-legacy/.env\n'
fi

if [ ! -d node_modules ]; then
  printf '[novel-tool] Dependencies missing; running reproducible install\n'
  npm ci --registry=https://registry.npmjs.org/
fi

printf '\n[novel-tool] Starting API + Web\n'
printf 'Web: http://127.0.0.1:5173 or http://<PHONE_IP>:5173\n'
printf 'API: http://127.0.0.1:3000/health\n\n'
npm run dev
