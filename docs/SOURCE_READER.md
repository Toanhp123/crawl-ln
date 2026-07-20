# Source Reader

Source Reader is the only runtime boundary for identifying novel URLs, reading metadata, listing chapters, fetching chapter content, searching supported sources, and managing source plugins. The crawler depends on the public `SourceReaderApi`; it does not load selectors, plugin files, credentials, or network routes directly.

## Architecture and module boundary

The bounded context lives at `apps/api/src/modules/source-reader`. Its public reader and management façades are exported from `public/`, application policies own fallback and authorization, infrastructure owns SQLite, HTTP, browser, crypto, cache, and plugin execution, and presentation maps typed errors to HTTP responses. Other modules may depend only on the public façades passed through the composition root.

Source Reader never writes novels, chapters, or crawl jobs. It returns source data to the crawler, which coordinates persistence through the owning modules.

## Built-in and external plugins

Built-in plugins are registered in-process by the composition root. External plugins are installed from a verified `.source-plugin` package and run in an isolated worker unless a trusted built-in explicitly uses in-process execution. The active version is selected atomically; disabled, quarantined, blocked, or incompatible versions are excluded from candidate resolution.

## Capability and matcher contract

A plugin manifest declares capabilities such as `identify`, `metadata`, `chapter-list`, `chapter-content`, `search`, `latest-updates`, and optional `authentication`. Matchers declare hosts, include/exclude paths, capability filters, and priority. Candidate order is deterministic and fallback occurs only for typed failures that explicitly allow it.

## `.source-plugin` package layout

A package is a ZIP archive with a manifest and compiled entry module at its root:

```text
plugin.json
index.js
assets/                 # optional, only when declared
signature.json          # required for signed trust
```

The manifest contains the plugin id, version, engine range, contract versions, capabilities, matchers, runtime preference, permissions, and optional authentication/network requirements. Package paths, stack traces, and raw installation details are never returned by the public API.

## Contract and extension versions

Every capability declares a contract version. The host rejects unsupported versions before execution. Optional extension values are wrapped with their own version and validated by the host; unknown optional extensions may be ignored, while unknown required extensions fail with `PLUGIN_CONTRACT_INCOMPATIBLE`.

## Trust levels and permission approval

Trust levels are `built-in`, `signed`, `local-unverified`, and `blocked`. External packages request scoped permissions for network hosts, browser use, authentication, persistent cache, and external assets. Requested permissions must be approved for the exact plugin version before activation. Permission denial, package mutation, or integrity failure disables or quarantines the affected version.

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

Other relevant settings are `SOURCE_READER_CURSOR_KEY`, `SOURCE_READER_MEMORY_CACHE_ENTRIES`, `SOURCE_READER_PLUGIN_DIR`, `SOURCE_READER_TRUSTED_KEYS_JSON`, `SOURCE_READER_BROWSER_EXECUTABLE`, `SOURCE_READER_DEFAULT_ROLES_JSON`, and `SOURCE_READER_TRUST_ROLE_HEADERS`.

## Authentication strategies and challenges

Standard strategies are cookie import, bearer token, basic authentication, and form login. Plugins may provide a custom authentication extension that receives only opaque handles. Secret values are resolved by the host at the last responsible moment and are not placed in plugin context.

Login may return a resumable OTP, approval, or browser-interaction challenge. Challenges are single-use, expire automatically, remain bound to the initiating actor and browser identity, and can be cancelled through the management API.

## Network profiles and VPN-gateway abstraction

Network profiles are actor-owned routes: direct, HTTP proxy, SOCKS proxy, or VPN gateway. A profile exposes only metadata and an opaque handle to the runtime. Resolution enforces ownership, region and tag requirements, health state, and session binding. A VPN gateway is an abstraction supplied by the host; plugins cannot start VPN software or inspect route credentials.

## Cache scopes and invalidation

Cache entries use `public`, `account`, `user`, `session`, or `none` scope. Public data may be reused across actors; authenticated scopes include the resolved credential, session, and network identities. Memory cache sits above SQLite persistence. TTL, stale-while-revalidate, immutable hints, tags, plugin version, capability contract, and signed cursor state participate in validation and invalidation.

## HTTP reader endpoints

All endpoints are under `/api/source-reader`:

- `POST /identify`
- `POST /metadata`
- `POST /chapter-list`
- `POST /chapter-content`
- `POST /search`
- `POST /latest-updates`

Requests may include credential and network profile ids. Responses use the canonical `{ data, error }` envelope and echo or create `x-request-id`.

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

Role and ownership checks run before repository, vault, runtime, or browser access. Responses expose metadata only; they never return credential values, proxy endpoints, browser cookies, filesystem paths, or raw stack traces.

## Error codes

Common typed codes include `SOURCE_NOT_SUPPORTED`, `CAPABILITY_NOT_SUPPORTED`, `PLUGIN_UNAVAILABLE`, `PLUGIN_DISABLED`, `PLUGIN_QUARANTINED`, `PLUGIN_CONTRACT_INCOMPATIBLE`, `PLUGIN_PERMISSION_DENIED`, `PLUGIN_NETWORK_PERMISSION_DENIED`, `PLUGIN_RESULT_INVALID`, `PLUGIN_PACKAGE_INVALID`, `AUTHENTICATION_REQUIRED`, `AUTHENTICATION_FAILED`, `CREDENTIAL_NOT_CONFIGURED`, `SESSION_EXPIRED`, `SESSION_NETWORK_MISMATCH`, `AUTH_CHALLENGE_REQUIRED`, `NETWORK_ROUTE_REQUIRED`, `NETWORK_REGION_UNAVAILABLE`, `SOURCE_REQUEST_TIMEOUT`, `SOURCE_RATE_LIMITED`, `SOURCE_TEMPORARILY_UNAVAILABLE`, `CURSOR_INVALID`, `SECRET_VAULT_UNAVAILABLE`, and `SOURCE_READER_INTERNAL_ERROR`.

Errors carry retry and fallback policy internally. Public details are redacted and observability labels are bounded; URLs, actor ids, credentials, and route identifiers are not metric labels.

## Plugin development workflow

1. Define the manifest, exact capability contracts, matchers, and minimum permissions.
2. Implement against the constrained context only; do not import host modules or perform direct filesystem/network/browser access.
3. Add fixture-based parser and contract tests.
4. Build the entry module and package the declared files into `.source-plugin`.
5. Sign the package when distributing through a trusted channel.
6. Install, review requested permissions, activate the exact version, run health checks, and test each capability.
7. Publish a new version instead of mutating an installed package; mutation triggers quarantine.

The platform does not provide CAPTCHA bypass, forced execution, or raw-secret APIs.

## Verification commands

```bash
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run verify
npm run test:e2e
```

The final architecture guards reject reintroduction of removed source runtimes, cross-module access to Source Reader internals, web calls outside `/api/source-reader/*`, and Source Reader writes to crawler-owned persistence.
