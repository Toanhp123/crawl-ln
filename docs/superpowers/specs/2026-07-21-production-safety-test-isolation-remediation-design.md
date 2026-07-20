# Production Safety and Test Isolation Remediation Design

**Status:** Proposed and approved in conversation; written review pending.

## Goal

Make Novel Tool safe by default for local use, require an explicit security boundary for LAN access, make test runs fully isolated from developer data, reduce build peak memory, restore cross-platform scripts, and improve the built-in NovelCool plugin's failure classification without changing the core Source Reader architecture.

## Scope

This remediation covers five bounded workstreams:

1. API binding, CORS, and remote bearer-token protection.
2. Source Reader local-administration role defaults.
3. Per-file test isolation and temporary runtime storage.
4. Build process isolation and cross-platform scripts.
5. NovelCool upstream-page detection, parser resilience, and documentation/config drift.

The following are intentionally out of scope for this patch:

- Full multi-user authentication, accounts, sessions, or password login.
- Refactoring `SourceReaderService` solely to reduce file size.
- Splitting all SQLite migrations into separate files.
- General product redesign or unrelated feature work.

## Security Model

### Local mode

The API binds to `127.0.0.1` by default. Local browser traffic is accepted only from configured local origins. Source Reader read operations remain available with the `reader` role. Administration roles are enabled only when `SOURCE_READER_LOCAL_ADMIN=true`.

Local mode is intended for a single-user desktop or Termux installation where the web UI and API run on the same machine. It is not an authentication system; its safety comes from loopback binding plus strict CORS.

### Remote/LAN mode

Binding to a non-loopback host is an explicit opt-in. Startup must fail when the configured host is non-loopback and `API_REMOTE_TOKEN` is absent or too weak.

For non-loopback requests to `/api/*`, middleware requires:

```http
Authorization: Bearer <API_REMOTE_TOKEN>
```

The bearer comparison must use a timing-safe comparison after validating equal byte lengths. `/health` may remain unauthenticated so process supervisors can probe the API, but it must disclose no secrets or configuration.

A request is considered local only when its remote address is a loopback address. A client cannot bypass authentication using `Host`, `Origin`, `X-Forwarded-For`, or role headers. Express proxy trust remains disabled by default.

### CORS

`API_CORS_ORIGINS` is a comma-separated allowlist. Defaults are:

- `http://127.0.0.1:5173`
- `http://localhost:5173`

Requests without an `Origin` header remain valid for CLI clients. Requests with a non-allowlisted origin are rejected. Wildcard CORS and reflected arbitrary origins are forbidden.

### Source Reader actor roles

Default roles become `['reader']`.

When `SOURCE_READER_LOCAL_ADMIN=true` and the request is from loopback, the actor receives:

- `reader`
- `source-manager`
- `source-admin`
- `system-admin`

`SOURCE_READER_TRUST_ROLE_HEADERS` remains false by default. When explicitly enabled, requested roles are intersected with the roles allowed by the current security mode; headers can never grant a remote unauthenticated request access.

## Configuration

New canonical API environment variables:

```dotenv
HOST=127.0.0.1
API_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
API_REMOTE_TOKEN=
SOURCE_READER_LOCAL_ADMIN=true
SOURCE_READER_TRUST_ROLE_HEADERS=false
```

Validation requirements:

- `HOST` defaults to `127.0.0.1`.
- Non-loopback `HOST` requires `API_REMOTE_TOKEN` with at least 32 characters.
- Empty `API_CORS_ORIGINS` is invalid.
- `*` is not accepted as a CORS origin.
- `SOURCE_READER_DEFAULT_ROLES_JSON` is removed from the public configuration surface to avoid insecure role defaults. Tests may inject actor roles directly through composition helpers rather than global environment mutation.

## Application Wiring

Add focused shared HTTP components:

```text
apps/api/src/shared/http/
├── api-access.middleware.ts
├── cors-options.ts
└── network-address.ts
```

Responsibilities:

- `network-address.ts`: normalize IPv4, IPv6, and IPv4-mapped IPv6 loopback addresses.
- `cors-options.ts`: produce strict Express CORS options from validated configuration.
- `api-access.middleware.ts`: require remote bearer authentication and attach a trusted local/remote access classification to the request.

Middleware order:

```text
strict CORS
→ JSON parser
→ health route
→ remote API access guard
→ application routes
→ 404
→ error handler
```

`main.ts` calls `listen(env.port, env.host)` and logs the actual configured host without printing the remote token.

## Test Isolation

### Process model

Every `.test.ts` file runs in its own Node process. The runner no longer uses:

- `--experimental-test-isolation=none`
- `--test-force-exit`

Each child process receives unique temporary paths:

```text
STORAGE_DIR=<os-temp>/novel-tool-test-<suite>-<id>/storage
SOURCE_READER_PLUGIN_DIR=<os-temp>/novel-tool-test-<suite>-<id>/plugins
```

The directories are created before the child process starts and removed after it exits. The parent runner limits concurrency to avoid excessive process and memory use.

### Open-handle policy

A test process that does not exit naturally before the configured timeout fails. The parent terminates it and reports the exact file. This turns leaked servers, timers, database handles, browser workers, and plugin processes into visible failures.

### Environment isolation

The runner constructs a fresh environment object per test file. Tests must not rely on environment mutation leaking between files or on ES module cache state from another file.

### Storage safety regression

A dedicated regression test must:

1. Start with no project-local `storage/novel-tool.sqlite`.
2. Run the integration test runner.
3. Assert that no project-local database was created or modified.

The test must use a temporary copy or a runner-level fixture so it never deletes real user data.

## Build and Cross-Platform Scripts

### Build process isolation

`build-prepared.mjs` orchestrates three short child processes:

1. API TypeScript emit and sandbox-entry copy.
2. Web TypeScript no-emit check.
3. Vite production build.

Each phase exits before the next begins, allowing compiler AST memory to be reclaimed. Commands are spawned directly with Node executables, not nested `npm run` chains.

### API workspace build

Replace the POSIX shell fragment in `apps/api/package.json` with a Node script:

```text
apps/api/scripts/build.mjs
```

It runs `tsc`, creates the destination directory with `mkdir({ recursive: true })`, and copies `sandbox-entry.mjs` with `copyFile`.

### Clean path safety

`clean.mjs` determines whether a deletion target is inside the repository using `path.relative()` and `path.isAbsolute()`. It must work with Windows and POSIX separators and refuse the repository root or paths outside it.

## NovelCool Plugin

### Upstream page classification

Before parsing metadata or chapters, the plugin classifies the returned HTML using non-secret signals:

- final URL when available;
- document title;
- known challenge/anti-bot markers;
- login/access-denied markers;
- presence of novel metadata and chapter-link structures.

Challenge or access-denied responses produce a typed `UPSTREAM_CHALLENGE_DETECTED` Source Reader error. A valid novel page with no chapter links still produces `PLUGIN_RESULT_INVALID`, but diagnostics include selector counts and a redacted page classification rather than raw HTML.

### Chapter selectors

Chapter extraction uses a small ordered list of documented selectors plus a conservative fallback for same-origin links whose URL shape indicates a chapter. Results are:

- normalized to absolute URLs;
- deduplicated by normalized URL;
- assigned stable indexes;
- ordered according to detected source order, avoiding unconditional reversal when the DOM is already ascending.

### Fixtures and tests

Add redacted fixtures for:

- current valid NovelCool novel-page structure;
- anti-bot/challenge page;
- valid page with duplicate chapter links;
- valid page with no chapters.

No live network request is required in the deterministic test suite. An optional manually invoked canary script may fetch a configured public URL, but it is excluded from `verify`.

## Documentation and Build Metadata

- Update README with local mode, LAN mode, bearer token, and CORS examples.
- Update `apps/api/.env.example` and `.env.termux.example` with safe defaults.
- Remove the unused root `.env.example` only after confirming no script references it.
- Derive the default web build identifier from `APP_BUILD`, Git commit when available, or package version; remove the stale dated literal.
- Update performance/test counts from fresh verification output.
- `check:docs` validates local links in every retained Markdown file, not only documentation entrypoints.
- Temporary design/plan files under `docs/superpowers` are removed before final delivery so the canonical documentation policy remains intact; Git history retains them.

## Compatibility and Migration

- Existing local installations that copy the updated API env example keep Source Reader administration enabled through `SOURCE_READER_LOCAL_ADMIN=true`.
- Installations with no `.env` become read-only for Source Reader administration rather than silently receiving administrator privileges.
- Existing LAN deployments must set `HOST` and `API_REMOTE_TOKEN`; startup failure is deliberate and includes actionable configuration guidance.
- No database migration is required.
- API response shapes remain unchanged except for new authentication errors (`401`/`403`) and clearer NovelCool error codes.

## Testing Strategy

### Security regression

- Default server bind host is loopback.
- Non-loopback configuration without token fails validation.
- Remote `/api/*` request without token returns `401`.
- Wrong token returns `401`; correct token succeeds.
- Local loopback request follows local-mode policy.
- Arbitrary CORS origin is rejected.
- Role headers cannot elevate when trust is disabled.
- Local admin flag controls management access.

### Runner regression

- Every test file receives distinct temp paths.
- Environment mutation in one file is invisible to another.
- A child with an open handle times out and fails with its filename.
- No `--test-force-exit` or isolation-disabled flag remains.
- Integration tests leave project storage untouched.

### Build regression

- `clean` path guard passes POSIX and Windows path cases.
- API workspace build copies sandbox entry on all platforms.
- Root `check`, `build`, and `verify` pass from a clean clone.
- Peak build memory is remeasured and recorded.

### Plugin regression

- Valid fixture returns metadata and chapters.
- Duplicate chapter links are removed.
- Challenge fixture returns `UPSTREAM_CHALLENGE_DETECTED`.
- Empty valid page returns `PLUGIN_RESULT_INVALID` with bounded diagnostics.

## Acceptance Criteria

The remediation is complete only when all conditions hold:

1. A default production start listens on loopback only.
2. Non-loopback startup without a strong token fails.
3. Remote administration without the bearer token is impossible.
4. Wildcard CORS is absent.
5. Source Reader administrator roles are not granted by default.
6. Regression and integration test files run in isolated processes without force exit.
7. Test execution cannot create or modify the repository's production storage path.
8. `npm run check`, `npm run build`, and `npm run verify` exit naturally from a clean clone.
9. API workspace build and clean path validation are cross-platform.
10. NovelCool challenge pages are distinguished from parser-empty pages.
11. All deterministic tests, integration tests, architecture gates, type checks, formatting checks, and production builds pass.
12. Final documentation contains only canonical active material; temporary implementation specs remain available through Git history.
