# Source Reader

Source Reader is the only runtime boundary for identifying novel URLs, reading metadata, listing chapters, fetching chapter content, searching supported sources, and managing source plugins. The ingestion module depends on the public `SourceReaderApi`; it does not load selectors, plugin files, credentials, or network routes directly.

## Architecture and module boundary

The bounded context lives at `apps/api/src/modules/source-reader`. Its public reader and management façades are exported from `public/`, application policies own fallback and authorization, infrastructure owns SQLite, HTTP, browser, crypto, cache, and plugin execution, and presentation maps typed errors to HTTP responses. Other modules may depend only on the public façades passed through the composition root.

Source Reader never writes novels, chapters, or ingestion jobs. It returns source data to the ingestion module, which coordinates persistence through the owning modules.

## Built-in and external plugins

Built-in plugins are registered in-process by the composition root. External plugins are installed from a verified `.source-plugin` package and execute in a supervised child-process sandbox with a constrained loader and schema-validated RPC. The active version is selected atomically; disabled, quarantined, blocked, or incompatible versions are excluded from candidate resolution.

External plugins never receive the host `PluginContext` object. Each operation receives a purpose-specific DTO and can request only approved HTTP, HTML, browser, cache, clock, URL, and logging operations through host-mediated RPC.

Build, check, test, and clean orchestration discovers plugin workspaces without provider-specific code. Plugin identity, version, package location, and declared domains come from each workspace manifest; the host application does not name a concrete source provider.

## Capability and matcher contract

A plugin manifest declares capabilities such as `identify`, `metadata`, `chapter-list`, `chapter-content`, `search`, `latest-updates`, and optional `authentication`. Matchers declare hosts, include/exclude paths, capability filters, and priority. Candidate order is deterministic and fallback occurs only for typed failures that explicitly allow it.

## `.source-plugin` package layout

A package is a ZIP archive with this required layout:

```text
manifest.json
checksums.json
dist/
  index.js
assets/                 # optional, only when declared and checksummed
signature.json          # optional; required when claiming signed trust
```

`checksums.json` must contain the SHA-256 digest of every package file except `checksums.json` and `signature.json`. Paths must be relative and safe; symbolic links, executable permission bits, native addons, unexpected unchecked files, and executable binary payloads are rejected.

The manifest contains the plugin id, version, engine range, contract versions, capabilities, matchers, runtime preference, permissions, and optional authentication/network requirements. Package paths, stack traces, and raw installation details are never returned by the public API.

## Contract and extension versions

Every capability declares a contract version. The host rejects unsupported versions before execution. Optional extension values are wrapped with their own version and validated by the host; unknown optional extensions may be ignored, while unknown required extensions fail with `PLUGIN_CONTRACT_INCOMPATIBLE`.

## Trust levels and permission approval

Trust levels are `built-in`, `signed`, `local-unverified`, and `blocked`. External packages request scoped permissions for network hosts, browser use, authentication, persistent cache, and external assets. Requested permissions must be approved for the exact plugin version before activation. Permission denial, package mutation, or integrity failure disables or quarantines the affected version.

The management descriptor keeps two version meanings separate: `latestVersion` is the newest installed candidate available for review and activation, while optional `activeVersion` is present only when a version is actually active. The host never fills `activeVersion` for an installed but inactive plugin.

Activation is an explicit manual `Install -> Approve -> Enable` sequence. Approval and enable requests both carry the exact `latestVersion`; installation, setup, build, start, and tests never approve or activate a plugin implicitly. When a newer version is installed beside an active version, the operator reviews that version first and then uses the explicit Activate latest action.

## First-party NovelCool installation

A full `npm run build` produces `dist/plugins/novelcool-2.0.0.source-plugin`. Build, setup, and start never install, update, approve, or activate that package. To use NovelCool, manually install it from the `/sources` Plugins page: choose **Install plugin**, upload the generated package, open the installed NovelCool version, approve its requested network access to `novelcool.com` and `*.novelcool.com`, and then enable version `2.0.0`.

The first-party artifact is unsigned, so the production verifier reports `local-unverified`: it was built locally and passed package integrity checks, but it is not trusted release-signed software. NovelCool execution is always `isolated` in the supervised child process; approval does not permit in-process execution.

Before installation, after disabling the plugin, or when its version is unavailable, NovelCool URLs intentionally have no matching candidate. This hard cutover has no built-in fallback. Existing library records and downloaded chapter data remain intact because plugin installation and candidate resolution do not rewrite library-owned persistence.

## Master-key generation and degraded mode

Generate a 32-byte base64 key:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Set it as:

```env
SOURCE_READER_MASTER_KEY=<base64-32-byte-key>
```

Credentials, network secrets, sessions, and challenge state use AES-256-GCM with record-bound additional authenticated data. When `SOURCE_READER_MASTER_KEY` is absent, non-secret public reading can still operate, but secret-backed operations fail with `SECRET_VAULT_UNAVAILABLE`. Rotating the key requires migrating encrypted records; replacing it without migration makes existing records unreadable.

Other relevant settings are `SOURCE_READER_CURSOR_KEY`, `SOURCE_READER_MEMORY_CACHE_ENTRIES`, `SOURCE_READER_PLUGIN_DIR`, `SOURCE_READER_TRUSTED_KEYS_JSON`, `SOURCE_READER_BROWSER_EXECUTABLE`, `SOURCE_READER_LOCAL_ADMIN`, and `SOURCE_READER_TRUST_ROLE_HEADERS`.

## Authentication strategies and challenges

Standard strategies are cookie import, bearer token, basic authentication, and form login. Plugins may provide a custom authentication extension that receives only purpose-specific, schema-validated DTOs. Secret values are resolved by the host at the last responsible moment and are not placed in plugin requests or context.

Login may return a resumable OTP, approval, or browser-interaction challenge. Challenges are single-use, expire automatically, remain bound to the initiating actor and browser identity, and can be cancelled through the management API.

## Browser runtime

A plugin version may request browser permission and declare `runtime.requiresBrowser`. Once that exact permission set is approved, Source Reader opens a host-managed browser session for the invocation.

Browser use is independent of whether authentication is required. Public JavaScript-heavy sources use an anonymous source-scoped browser identity; authenticated sources bind the browser session to the resolved credential, actor, and network route. Plugins receive only the restricted browser operations exposed by the host and never receive Playwright objects, raw browser profiles, or unrestricted secret values.

## Network profiles

Network profiles are actor-owned routes of these supported types:

- `direct`
- `http-proxy`
- `https-proxy`
- `socks-proxy`

A profile exposes only metadata and an opaque handle to the runtime. Resolution enforces ownership, region and tag requirements, health state, and session binding. Supported routes are direct, HTTP proxy, HTTPS proxy, and SOCKS proxy.

## Cache scopes and invalidation

Cache entries use `public`, `account`, `user`, `session`, or `none` scope. Public data may be reused across actors; authenticated scopes include the resolved credential, session, and network identities. Memory cache sits above SQLite persistence. TTL, stale-while-revalidate, immutable hints, tags, plugin version, capability contract, and signed cursor state participate in validation and invalidation.

## Runtime bounds and cancellation

Reader requests may include `timeoutMs`, an integer from `1` through `120000`. The selected timeout is enforced for both in-process and external plugins. Cancellation is propagated through the invocation signal, and external processes are terminated when they do not stop within the supervisor grace period.

Sandbox RPC validates protocol version and operation-specific schemas and rejects frames that exceed the configured nesting-depth, node-count, or approximate byte-size bounds before recursive schema parsing. Chapter streaming also fails closed when a plugin claims more pages without a cursor, produces an empty non-final page, repeats a cursor, or exceeds the host page budget.

## HTTP reader endpoints

All endpoints are under `/api/source-reader`:

- `POST /identify`
- `POST /metadata`
- `POST /chapter-list`
- `POST /chapter-content`
- `POST /search`
- `POST /latest-updates`

Requests may include `credentialProfileId`, `networkProfileId`, `freshOnly`, and `timeoutMs`. Paginated requests may include a signed host cursor and a bounded `limit`. Responses use the canonical `{ data, error }` envelope and echo or create `x-request-id`.

## HTTP administration endpoints

- `GET /plugins`
- `POST /plugins/install`
- `POST /plugins/:pluginId/enable`
- `POST /plugins/:pluginId/disable`
- `DELETE /plugins/:pluginId`
- plugin test, health, and permission endpoints
- credential list/create/update/delete/login/logout/test endpoints
- network profile list/create/update/delete/test endpoints
- auth challenge list/get/respond/cancel endpoints

The API binds to loopback by default. Local administration is enabled only with `SOURCE_READER_LOCAL_ADMIN=true`; otherwise actors receive the `reader` role. A local request without `x-source-reader-user-id` receives the stable `local-user` identity, which is the default local owner. Remote API access requires the configured bearer token. Remote `x-source-reader-user-id` and `x-source-reader-roles` headers are both ignored unless `SOURCE_READER_TRUST_ROLE_HEADERS=true` and the request is authenticated; enabling that option delegates actor identity and role assertions to the trusted client. Role and ownership checks run before repository, vault, runtime, or browser access. Responses expose metadata only; they never return credential values, proxy endpoints, browser cookies, filesystem paths, or raw stack traces.

## Web administration console

The `/sources` web route is the Source Reader administration console. It follows Feature-Sliced Design: pages compose widgets, widgets coordinate independent features, entity slices own Source Reader HTTP clients and display models, and shared owns transport, localization, theme tokens, motion, and reusable UI primitives.

The console exposes five user-facing sections:

- **Plugins** — list, search, install, enable, disable, test, remove, inspect diagnostics and health, and approve or deny version-scoped permissions.
- **Credentials** — create write-only cookie, bearer, basic, form-login, or custom secrets; replace or remove secrets; login, logout, and test through an optional network profile.
- **Network** — create, update, enable, disable, test, and remove direct, HTTP, HTTPS, or SOCKS routes.
- **Challenges** — poll pending OTP, approval, CAPTCHA, or browser-interaction challenges and submit, reject, complete, or cancel the supported response types.
- **Inspector** — invoke identify, metadata, chapter-list, chapter-content, search, and latest-updates with optional credential, network, cache, timeout, cursor, and limit controls.

`streamChapterList` remains an internal ingestion capability and is intentionally not exposed to the browser. Credential and proxy secret values are write-only form state: they are cleared after mutations, never placed in query keys, never persisted by the browser query cache, and never rendered back by list APIs.

## Error codes

Common typed codes include `SOURCE_NOT_SUPPORTED`, `CAPABILITY_NOT_SUPPORTED`, `PLUGIN_UNAVAILABLE`, `PLUGIN_DISABLED`, `PLUGIN_QUARANTINED`, `PLUGIN_CONTRACT_INCOMPATIBLE`, `PLUGIN_PERMISSION_DENIED`, `PLUGIN_NETWORK_PERMISSION_DENIED`, `PLUGIN_RESULT_INVALID`, `PLUGIN_PACKAGE_INVALID`, `PLUGIN_RPC_PROTOCOL_INVALID`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED`, `CREDENTIAL_NOT_CONFIGURED`, `SESSION_EXPIRED`, `SESSION_NETWORK_MISMATCH`, `AUTH_CHALLENGE_REQUIRED`, `NETWORK_ROUTE_REQUIRED`, `NETWORK_ROUTE_UNSUPPORTED`, `NETWORK_REGION_UNAVAILABLE`, `SOURCE_REQUEST_TIMEOUT`, `SOURCE_RATE_LIMITED`, `SOURCE_TEMPORARILY_UNAVAILABLE`, `UPSTREAM_CHALLENGE_DETECTED`, `CURSOR_INVALID`, `SECRET_VAULT_UNAVAILABLE`, and `SOURCE_READER_INTERNAL_ERROR`.

Errors carry retry and fallback policy internally. Public details are redacted and observability labels are bounded; URLs, actor ids, credentials, and route identifiers are not metric labels.

## Plugin development workflow

1. Define `manifest.json`, exact capability contracts, matchers, and minimum permissions.
2. Implement against the constrained context only; do not import host modules or perform direct filesystem/network/browser access.
3. Add fixture-based parser and contract tests.
4. Build the entry module as `dist/index.js`.
5. Generate `checksums.json` for every included file except checksum/signature documents.
6. Add `signature.json` when distributing through a trusted signed channel.
7. Package the files into `.source-plugin`, install it, review requested permissions, activate the exact version, and run capability health tests.
8. Publish a new version instead of mutating an installed package; mutation triggers quarantine.

The platform does not provide CAPTCHA bypass, forced execution, or raw-secret APIs.

## Verification commands

```bash
npm run check
npm run build
npm run test:regression
npm run test:integration
npm run check
npm test
npm run test:e2e
```

The final architecture guards reject reintroduction of removed source runtimes, cross-module access to Source Reader internals, web calls outside `/api/source-reader/*`, and Source Reader writes to ingestion- or library-owned persistence.
