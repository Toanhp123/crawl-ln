# Getting Started

This guide applies to Windows, macOS, and Linux. Run the commands from the repository root.

## Prerequisites

- Node.js `>=22.12.0` and npm `>=10.0.0`.
- Git, if you are working from the source repository.
- Chromium only when you need browser-based crawling or browser tests.

## Install and Run

```bash
npm run setup
cp apps/api/.env.example apps/api/.env
npm run dev
```

On Windows, copy `apps/api/.env.example` to `apps/api/.env` with File Explorer or PowerShell:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

Open `http://127.0.0.1:5173` in a browser. The API health endpoint is `http://127.0.0.1:3000/health`.

`npm run setup` installs the locked dependencies and checks the local toolchain. Add `-- --browser` when browser capability is required:

```bash
npm run setup -- --browser
```

## Production Check

```bash
npm run check
npm run build
npm run start
```

The production server serves the API and web app from one process. Use [Configuration](CONFIGURATION.md) before exposing it beyond the local machine.

## Troubleshooting

- If Node or npm is rejected, select the versions in `.nvmrc` and retry `npm run setup`.
- If browser tests report a missing browser, rerun setup with `-- --browser` or set `SOURCE_READER_BROWSER_EXECUTABLE` to an installed Chromium executable.
- If the web app cannot reach the API, confirm that port `3000` is available and that `API_CORS_ORIGINS` includes the web origin.
- Use `npm run clean` to remove generated build and test output. Review the printed paths before using `npm run clean -- --data`.
