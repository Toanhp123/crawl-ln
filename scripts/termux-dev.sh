#!/usr/bin/env sh
set -eu

printf '\n[novel-tool] Termux one-command setup + dev\n'
command -v node >/dev/null 2>&1 || { echo 'Node.js not found. Run: pkg install nodejs'; exit 1; }
command -v npm >/dev/null 2>&1 || { echo 'npm not found. Run: pkg install nodejs'; exit 1; }

mkdir -p apps/api/storage apps/api/config
if [ ! -f apps/api/.env ]; then
  if [ -f apps/api/.env.termux.example ]; then
    cp apps/api/.env.termux.example apps/api/.env
  else
    cp apps/api/.env.example apps/api/.env
  fi
  printf '[novel-tool] Created apps/api/.env\n'
else
  printf '[novel-tool] apps/api/.env already exists, keeping it\n'
fi

printf '[novel-tool] Installing/updating dependencies from npmjs.org\n'
npm install --registry=https://registry.npmjs.org/

printf '\n[novel-tool] Starting API + Web\n'
printf 'Web: http://127.0.0.1:5173 or http://<PHONE_IP>:5173\n'
printf 'API: http://127.0.0.1:3000/health\n\n'
npm run dev
