# Configuration

`npm run setup` creates `apps/api/.env` from `apps/api/.env.example` when it is missing and preserves an existing file. During first-time creation it generates unique values for `SOURCE_READER_CURSOR_KEY` and `SOURCE_READER_MASTER_KEY`; generated secrets are never printed. Values are read by the API at startup; restart the process after changing them.

## Server and Storage

```env
HOST=127.0.0.1
PORT=3000
STORAGE_DIR=./storage
# DATABASE_PATH=./storage/novel-tool.sqlite
API_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

`HOST=127.0.0.1` is the safe local default. `STORAGE_DIR` contains the database, installed source plugins, and runtime files. Keep it outside version control and back it up using your normal data policy.

## Source Reader Runtime

```env
SOURCE_READER_CURSOR_KEY=<generated-by-npm-run-setup>
SOURCE_READER_MASTER_KEY=<generated-base64-for-exactly-32-bytes>
# SOURCE_READER_PLUGIN_DIR=./storage/source-plugins
# SOURCE_READER_BROWSER_EXECUTABLE=/absolute/path/to/chromium
SOURCE_READER_NETWORK_DIAGNOSTIC_URL=https://example.com/
SOURCE_READER_EXTERNAL_PROCESS_START_TIMEOUT_MS=10000
SOURCE_READER_PLUGIN_POLICY_VIOLATION_THRESHOLD=3
SOURCE_READER_LOCAL_ADMIN=true
SOURCE_READER_TRUST_ROLE_HEADERS=false
```

Generate a master key when credentials, sessions, proxy secrets, or challenge state are needed:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set the result as `SOURCE_READER_MASTER_KEY`. It must decode to exactly 32 bytes. Without it, public reading can run in degraded mode, while secret-backed operations return a clear configuration error.

## LAN Access

Only expose the API deliberately. A non-loopback host requires a bearer token of at least 32 characters:

```env
HOST=0.0.0.0
API_CORS_ORIGINS=http://192.168.1.50:5173
API_REMOTE_TOKEN=replace-with-at-least-32-random-characters
SOURCE_READER_TRUST_ROLE_HEADERS=false
```

Remote API requests must send `Authorization: Bearer <API_REMOTE_TOKEN>`. Do not put tokens in URLs, browser storage, screenshots, or logs. Keep CORS origins explicit; wildcards are rejected.

## Operational Limits

The example file also exposes queue, crawler, request timeout, export-size, and plugin policy limits. Increase them only after measuring the workload and protecting the host machine. See [Security](SECURITY.md) for deployment guidance.
