# Source Reader Module Design

## 1. Goal

Replace the current crawler-owned source profile and plugin paths with one independent backend module named **Source Reader**.

Source Reader is the only backend boundary allowed to discover, select, load, execute, and supervise source plugins. It exposes a stable set of normalized read operations to crawler, novels, search, and selected HTTP clients. Domain-specific behavior lives in capability extensions supplied by plugins.

The completed system has one source-reading path:

```text
Crawler / Novels / Search / HTTP
                ↓
        SourceReaderApi
                ↓
 Capability Registry + Runtime Context
                ↓
 Built-in or external source plugin
                ↓
 HTTP / Browser / Auth / Network infrastructure
```

The current `SourceProfile`, selector-profile adapter, old plugin module, and fallback chain are removed. No compatibility layer, feature flag, or legacy adapter remains after migration.

## 2. Design Principles

1. **One stable façade:** Consumers depend only on `modules/source-reader/public/*`.
2. **Capability-based plugins:** A plugin implements only the operations it supports.
3. **Per-capability composition:** Multiple plugins may serve one domain, with independent priority and fallback for each capability.
4. **Domain-specific extension data:** Results contain normalized core data plus versioned, namespaced extensions.
5. **Least privilege:** External plugins receive only an explicit runtime context and cannot access backend internals directly.
6. **Trust-aware execution:** Trusted code may run in process; unverified external code always runs isolated.
7. **Auth and network are runtime requirements:** Login, browser interaction, proxy, region, and VPN routing are infrastructure concerns, not reading capabilities.
8. **Module-owned state:** Source Reader owns its tables, repositories, cache, sessions, and plugin installation records.
9. **Crawler remains the orchestrator:** Source Reader reads and normalizes. Crawler manages jobs, queues, persistence, progress, and business retry.
10. **Fail explicitly:** Unsupported sources, capabilities, credentials, routes, contracts, and plugin states produce stable machine-readable errors.

## 3. Scope

### 3.1 In scope

- A standalone `source-reader` backend module.
- Built-in plugins compiled with the backend.
- External `.source-plugin` packages.
- Capability registry, domain/path matchers, priority, `canHandle`, and fallback.
- Trusted in-process and isolated worker runtimes.
- HTTP, HTML, browser, authentication, session, cache, URL, logging, clock, and cancellation services exposed through `PluginContext`.
- Standard and custom authentication strategies.
- OTP, CAPTCHA, approval, and browser-interaction challenges.
- User and system credential profiles.
- User and system network profiles, including region-aware proxy or VPN gateway routing.
- Versioned plugin contracts and extension schemas.
- Multi-layer, scope-aware caching.
- Plugin installation, signature/checksum verification, permissions, health, lifecycle, and quarantine.
- Internal TypeScript API and limited public/admin HTTP APIs.
- Dedicated SQLite tables in the existing application database.
- Secret storage abstraction with a local encrypted implementation.
- Full replacement of existing source profile and plugin reading paths.

### 3.2 Out of scope

- Source Reader does not create or persist novels, chapters, or crawl tasks.
- Source Reader does not own crawl scheduling, job progress, or business-level retries.
- Plugins cannot automatically solve or bypass CAPTCHA.
- Plugins cannot start system VPN software or alter host-level network settings.
- HTTP clients cannot select arbitrary plugin code, execution mode, proxy URL, raw cookie, or secret.
- No legacy source profile or old plugin compatibility layer remains in the final system.

## 4. Module Boundary and Layout

The module lives at:

```text
apps/api/src/modules/source-reader/
├── domain/
│   ├── capabilities/
│   ├── contracts/
│   ├── errors/
│   ├── plugin/
│   ├── auth/
│   ├── network/
│   └── cache/
├── application/
│   ├── ports/
│   ├── services/
│   ├── use-cases/
│   │   ├── reader/
│   │   ├── plugins/
│   │   ├── credentials/
│   │   ├── network/
│   │   └── auth-challenges/
│   └── policies/
├── infrastructure/
│   ├── plugins/
│   │   ├── built-in/
│   │   ├── package-loader/
│   │   └── registry/
│   ├── runtime/
│   │   ├── in-process/
│   │   ├── isolated-worker/
│   │   └── browser-worker/
│   ├── auth/
│   ├── network/
│   ├── cache/
│   ├── secrets/
│   └── sqlite/
├── presentation/
│   ├── controllers/
│   ├── dto/
│   └── routes/
└── public/
    └── source-reader.api.ts
```

Composition is owned by:

```text
apps/api/src/shared/container/modules/source-reader.module.ts
```

Other modules may import only the public façade and public request/result contracts. Architecture checks prohibit direct imports from Source Reader infrastructure, repositories, registry, runtime, or secret components.

## 5. Public Source Reader API

The internal TypeScript API is the primary integration surface.

```ts
interface SourceReaderApi {
  identify(
    request: IdentifyRequest
  ): Promise<SourceReaderResult<SourceIdentity>>;

  readMetadata(
    request: ReadMetadataRequest
  ): Promise<SourceReaderResult<NovelMetadata>>;

  readChapterList(
    request: ReadChapterListRequest
  ): Promise<SourceReaderResult<Page<ChapterSummary>>>;

  streamChapterList(
    request: StreamChapterListRequest
  ): AsyncIterable<SourceReaderResult<ChapterSummary[]>>;

  readChapterContent(
    request: ReadChapterContentRequest
  ): Promise<SourceReaderResult<ChapterContent>>;

  search(
    request: SearchSourceRequest
  ): Promise<SourceReaderResult<Page<NovelSearchResult>>>;

  latestUpdates(
    request: LatestUpdatesRequest
  ): Promise<SourceReaderResult<Page<LatestUpdate>>>;
}
```

All requests support an `AbortSignal`. Requests that may depend on identity or network routing can include a user ID, credential profile ID, network profile ID, freshness policy, and execution timeout. Callers cannot force a plugin ID or execution mode.

### 5.1 Standard capabilities

```ts
type SourceCapability =
  | 'identify'
  | 'metadata'
  | 'chapter-list'
  | 'chapter-content'
  | 'search'
  | 'latest-updates'
  | 'authentication';
```

A plugin is not required to implement every capability. A declared capability requires the matching method. An undeclared method is ignored and produces a load warning.

Calling an unsupported capability returns `CAPABILITY_NOT_SUPPORTED`.

### 5.2 List pagination and streaming

List operations use opaque cursors:

```ts
interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}
```

`readChapterList`, `search`, and `latestUpdates` use cursor pagination. `streamChapterList` provides backpressure-aware batch iteration for crawler use.

A cursor is signed or encrypted by Source Reader and binds:

- normalized request fingerprint;
- plugin ID and version;
- capability contract version;
- relevant extension contract versions;
- expiration time.

Consumers cannot decode or modify cursors. A plugin or contract version change invalidates existing cursors with `CURSOR_INVALIDATED`.

## 6. Result Contract and Domain Extensions

Every successful operation returns normalized data and execution provenance:

```ts
interface SourceReaderResult<TData> {
  data: TData;

  source: {
    pluginId: string;
    pluginVersion: string;
    domain: string;
    capability: SourceCapability;
  };

  extensions?: Record<string, VersionedExtensionValue>;
  warnings?: SourceReaderWarning[];
}

interface VersionedExtensionValue {
  version: number;
  data: unknown;
}
```

Consumers such as crawler and novels depend only on normalized `data`. A consumer that understands source-specific information may opt into a versioned extension.

Extension keys follow:

```text
<namespace>/<capability>
```

Examples:

```text
novelcool.com/metadata@1
novelcool.com/chapter-list@2
novelcool.com/chapter-content@1
```

Plugins register JSON Schema for each extension contract. Source Reader validates extension output before returning it.

If normalized core data is valid but an optional extension fails validation, Source Reader returns the core result with a warning. If the manifest marks that extension as required, the invocation fails with `PLUGIN_RESULT_INVALID`.

## 7. Plugin Contract

Built-in and external plugins use the same logical contract:

```ts
interface SourceReaderPlugin {
  manifest: SourcePluginManifest;

  canHandle?(
    request: PluginMatchRequest,
    context: PluginProbeContext
  ): boolean | Promise<boolean>;

  identify?(
    request: IdentifyPluginRequest,
    context: PluginContext
  ): Promise<IdentifyPluginResult>;

  readMetadata?(
    request: MetadataPluginRequest,
    context: PluginContext
  ): Promise<MetadataPluginResult>;

  readChapterList?(
    request: ChapterListPluginRequest,
    context: PluginContext
  ): Promise<ChapterListPluginResult>;

  readChapterContent?(
    request: ChapterContentPluginRequest,
    context: PluginContext
  ): Promise<ChapterContentPluginResult>;

  search?(
    request: SearchPluginRequest,
    context: PluginContext
  ): Promise<SearchPluginResult>;

  latestUpdates?(
    request: LatestUpdatesPluginRequest,
    context: PluginContext
  ): Promise<LatestUpdatesPluginResult>;

  authentication?: AuthenticationExtension;
  lifecycle?: PluginLifecycle;
}
```

### 7.1 Manifest

```ts
interface SourcePluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;

  engines: {
    sourceReader: string;
  };

  capabilities: SourceCapability[];
  contracts: Partial<Record<SourceCapability, number>>;
  matchers: PluginMatcher[];

  runtime: {
    preferredMode: 'in-process' | 'isolated';
    requiresBrowser?: boolean;
  };

  permissions: PluginPermissionDeclaration;
  runtimeRequirements?: PluginRuntimeRequirements;
  extensionContracts?: Record<string, ExtensionContractDeclaration>;
}
```

Compatibility uses both a Source Reader SemVer range and per-capability contract versions. An incompatible capability is not registered. Other compatible capabilities from the same plugin may remain active.

### 7.2 Matchers and per-capability composition

```ts
interface PluginMatcher {
  hosts: string[];
  include?: string[];
  exclude?: string[];
  capabilities?: SourceCapability[];
  priority: number;
}
```

Selection order:

```text
Normalize URL
→ filter by host
→ apply include/exclude patterns
→ filter by requested capability
→ filter by plugin status and contract compatibility
→ verify runtime requirements
→ sort by priority
→ call canHandle when present
→ execute the first eligible candidate
```

One domain may use separate plugins for metadata, chapter list, chapter content, search, and authentication. Multiple plugins may provide the same capability; priority selects the primary candidate and later candidates provide fallback.

The registry is conceptually:

```ts
Map<Domain, Map<SourceCapability, PluginCandidate[]>>
```

### 7.3 Fallback policy

Fallback is allowed for failures that indicate another implementation may succeed:

- temporary network failure;
- temporary source failure;
- parser mismatch;
- plugin runtime failure;
- invalid plugin result.

Fallback is not automatic for:

- authentication required or failed;
- authorization failure;
- invalid caller request;
- cancellation;
- denied runtime requirement.

Each attempt records plugin, version, capability, duration, outcome, and failure code. Public results identify the successful plugin. Detailed attempt diagnostics are available only through redacted administrative diagnostics.

## 8. Plugin Packaging, Trust, and Lifecycle

### 8.1 Package format

External plugins are distributed as `.source-plugin` archives:

```text
plugin-name.source-plugin
├── manifest.json
├── dist/
│   └── index.js
├── schemas/
├── assets/
├── checksums.json
└── signature.json
```

Development mode may load a plugin directly from a directory. Production installation always imports into the Source Reader plugin store.

```text
data/source-plugins/
├── packages/
├── installed/
├── active/
├── quarantine/
└── development/
```

Installation never executes plugin code before package validation and permission approval.

### 8.2 Trust levels

```ts
type PluginTrustLevel =
  | 'built-in'
  | 'signed'
  | 'local-unverified'
  | 'blocked';
```

- `built-in`: compiled with the backend and trusted by the application release.
- `signed`: checksum and signature verified against a trusted key.
- `local-unverified`: manually installed and explicitly approved by an administrator; always isolated.
- `blocked`: invalid manifest, checksum, signature, or policy; never executed.

A plugin cannot assign its own trust level. Source Reader determines trust from installation origin and verification.

### 8.3 Permission approval

Plugin permissions are version-specific. Source Reader compares the new version against the last approved version.

Any increase in domains, browser access, authentication access, network access, persistent cache access, or external asset access places the version in `pending-approval`.

No permission equivalent to “approve all future changes” exists.

### 8.4 Lifecycle

```ts
interface PluginLifecycle {
  initialize?(context: PluginInitializationContext): Promise<void>;
  healthCheck?(context: PluginHealthContext): Promise<PluginHealthResult>;
  shutdown?(): Promise<void>;
}
```

Plugin states:

```ts
type PluginStatus =
  | 'installed'
  | 'pending-approval'
  | 'initializing'
  | 'active'
  | 'degraded'
  | 'disabled'
  | 'quarantined'
  | 'failed';
```

Activation is atomic:

```text
installed
→ permission approval
→ initialize
→ health check
→ active
```

A degraded plugin may keep healthy capabilities active. Health and circuit-breaker state are tracked per plugin, capability, domain, and network route class so one failed capability does not disable unrelated capabilities.

## 9. Runtime Isolation and Plugin Context

### 9.1 Execution modes

Source Reader provides:

```text
InProcessPluginRuntime
IsolatedWorkerPluginRuntime
BrowserWorkerRuntime
```

Built-in and trusted signed plugins may run in process when policy allows. External or unverified plugins always run in isolated workers. The backend may force any plugin into isolation regardless of its preferred mode.

Worker runtime enforces invocation timeout, memory/resource limits, cancellation, controlled module loading, and termination after a grace period.

### 9.2 PluginContext

```ts
interface PluginContext {
  http: PluginHttpClient;
  html: PluginHtmlReader;
  browser?: PluginBrowserClient;

  auth: PluginAuthContext;
  network: PluginNetworkContext;

  cache: PluginScopedCache;
  url: PluginUrlTools;
  logger: PluginLogger;
  clock: PluginClock;

  signal: AbortSignal;
}
```

External plugins cannot access directly:

- `process.env`;
- the host filesystem;
- SQLite or application repositories;
- `child_process` or arbitrary workers;
- raw sockets or unrestricted network clients;
- credential ciphertext or master keys;
- browser profiles stored on disk;
- internal backend modules.

Built-in plugins may use explicitly allowlisted internal packages, but all source traffic still goes through `context.http` or `context.browser` to preserve policy, rate limiting, authentication, routing, cancellation, and observability.

## 10. HTTP and HTML Runtime

Every plugin HTTP request passes through:

```text
URL validation
→ declared host permission check
→ network route resolution
→ session/cookie/token attachment
→ source/domain/account rate limit
→ timeout
→ redirect policy
→ response-size limit
→ short technical retry
→ audit and redacted logging
```

Manifest network permissions declare allowed hosts. Requests outside that scope fail with `PLUGIN_NETWORK_PERMISSION_DENIED`.

Source Reader owns HTML parsing helpers. Plugins may implement selectors, DOM traversal, structured data extraction, or custom parsing while returning normalized contracts.

## 11. Authentication, Browser Challenges, and Sessions

### 11.1 Auth strategies

Standard strategies:

```ts
type StandardAuthStrategy =
  | 'cookie-import'
  | 'bearer-token'
  | 'basic-auth'
  | 'form-login';
```

Plugins use configuration for standard flows and implement `AuthenticationExtension` only for custom behavior.

```ts
interface AuthenticationExtension {
  login(
    request: PluginLoginRequest,
    context: PluginAuthExecutionContext
  ): Promise<AuthExecutionResult>;

  refreshSession?(
    request: RefreshSessionRequest,
    context: PluginAuthExecutionContext
  ): Promise<AuthExecutionResult>;

  logout?(
    request: LogoutRequest,
    context: PluginAuthExecutionContext
  ): Promise<void>;

  resumeChallenge?(
    request: ResumeChallengeRequest,
    context: PluginAuthExecutionContext
  ): Promise<AuthExecutionResult>;
}
```

### 11.2 Secret handling

Plugins receive credential or secret handles, never vault keys. Browser form filling accepts a `SecretValueHandle` so the runtime can decrypt and enter a password without returning plaintext to plugin code.

### 11.3 Auth challenges

```ts
type AuthExecutionResult =
  | {
      status: 'authenticated';
      session: AuthSessionMaterial;
    }
  | {
      status: 'challenge-required';
      challenge: AuthChallenge;
    };
```

Challenge types:

```ts
type AuthChallengeType =
  | 'otp'
  | 'captcha'
  | 'approval'
  | 'browser-interaction';
```

OTP and approval flows pause and resume through a challenge ID. CAPTCHA and interactive login are completed by the user in an isolated browser context. Source Reader never attempts to bypass CAPTCHA.

Challenge expiration closes browser contexts, destroys temporary state, and revokes incomplete sessions.

### 11.4 Browser worker

Browser contexts are isolated by:

```text
userId + pluginId + sourceAccountId + networkRouteId
```

The plugin browser API is restricted to approved navigation, selection, input, interaction, and cookie transfer operations. Browser policy controls allowed domains, lifetime, memory, navigation count, popups, downloads, uploads, and network interception.

### 11.5 Session binding

Sessions are scoped by plugin, plugin version, credential profile, owner, and network route where required.

```ts
interface AuthSession {
  id: string;
  pluginId: string;
  sourceAccountId: string;
  userId?: string;
  networkRouteId?: string;
  networkBinding: 'none' | 'preferred' | 'required';
  expiresAt?: string;
  status: 'active' | 'expired' | 'revoked';
}
```

A route-bound session is not reused through a different route. Source Reader re-authenticates or returns `SESSION_NETWORK_MISMATCH`.

## 12. Network Profiles, Proxy, Region, and VPN

VPN is represented as a network route, not a source capability.

```ts
interface NetworkRoute {
  id: string;
  ownerType: 'system' | 'user';
  ownerId?: string;

  type:
    | 'direct'
    | 'http-proxy'
    | 'socks-proxy'
    | 'vpn-gateway';

  regions: string[];
  tags: string[];
  status: 'healthy' | 'degraded' | 'offline';
}
```

Plugins declare requirements such as allowed regions, route tags, whether routing is mandatory, and whether direct fallback is allowed. Plugins never start a VPN client or alter host-level proxy configuration.

Resolution order:

```text
request-specific user profile
→ user default
→ system default for plugin/domain
→ any route satisfying plugin requirements
→ direct only when permitted
```

Missing or unhealthy routes produce stable network errors. Source Reader never silently uses direct access when the requirement forbids it.

## 13. Runtime Context Resolution

Before invocation:

```ts
const resolved = await runtimeContextResolver.resolve({
  userId,
  pluginId,
  domain,
  capability,
  credentialProfileId,
  networkProfileId
});
```

Priority:

```text
explicit user override
→ user default
→ system default
→ plugin runtime requirement
→ anonymous/direct when allowed
```

The resolved context contains validated handles and non-secret execution metadata only:

```ts
interface ResolvedRuntimeContext {
  credential?: CredentialHandle;
  session?: AuthSessionHandle;
  networkRoute: NetworkRouteHandle;
  executionMode: 'in-process' | 'isolated';
  browserRequired: boolean;

  cacheIdentity: {
    authScope: string;
    networkScope: string;
  };
}
```

## 14. Caching

Source Reader owns a two-layer cache:

```text
Memory LRU cache
→ persistent SQLite cache
→ plugin/source invocation
```

Policies vary by capability. Metadata and search normally use shorter TTLs, chapter lists use short TTL plus stale-while-revalidate, and published chapter content may be treated as long-lived or immutable when source semantics permit.

Plugins may propose cache hints, but Source Reader may reduce TTL, narrow scope, or disable caching. Plugins cannot broaden a cache scope selected by policy.

### 14.1 Cache scopes

```ts
type CacheScope =
  | 'public'
  | 'account'
  | 'user'
  | 'session'
  | 'none';
```

- `public`: safe to share system-wide.
- `account`: isolated to one source account.
- `user`: isolated to one application user.
- `session`: isolated to one auth session.
- `none`: never cached.

Source Reader validates scope based on authentication, entitlement, personalization, and sensitivity. It may narrow `public` to a more private scope but cannot automatically broaden a private scope.

### 14.2 Cache key

The cache key includes:

- capability;
- normalized URL;
- request parameters;
- plugin ID and version;
- capability contract version;
- extension contract versions;
- cache scope and scope identity hash;
- authentication scope identity;
- network scope identity.

This prevents account, user, session, region, route, plugin-version, and contract-version data leakage.

### 14.3 Stale-while-revalidate

Stale data may be returned with a `STALE_CACHE_USED` warning during temporary source failures. Stale data is prohibited when credentials are revoked, sessions expire, contracts change, sensitive data is involved, or the request requires fresh data.

### 14.4 Invalidation

Cache entries support tags for plugin, plugin version, domain, capability, credential, network profile, normalized novel URL, and related resource identities.

Plugin upgrades, credential changes, route changes, session revocation, and crawler-detected chapter-list changes invalidate matching entries.

## 15. Persistence Ownership

Source Reader uses the current SQLite database but exclusively owns tables prefixed with `source_reader_`.

Minimum table set:

```text
source_reader_plugins
source_reader_plugin_versions
source_reader_plugin_permissions
source_reader_installations
source_reader_credentials
source_reader_network_profiles
source_reader_sessions
source_reader_auth_challenges
source_reader_cache_entries
source_reader_health_checks
```

Only Source Reader repositories access these tables. Other modules use public use cases and keep only opaque reference IDs where necessary.

### 15.1 Plugin records

Plugin identity, trust level, enabled state, lifecycle status, active version, timestamps, manifest, package location, checksum, signature status, and approval state are stored separately from installed versions so activation and rollback are atomic.

### 15.2 Credential records

Credentials support `system` and `user` ownership and may bind to a plugin, domain, or account profile. Secret payloads are encrypted; list/read APIs return metadata only.

Removing or changing a credential revokes dependent sessions and invalidates account/user/session cache entries.

### 15.3 Network records

Network profiles support direct, HTTP proxy, SOCKS proxy, and VPN gateway routes. Sensitive connection configuration is encrypted. Health metadata is stored separately from secret material.

### 15.4 Session and challenge records

Session material and resumable challenge state are encrypted. Expired sessions and challenges are retained only according to a bounded audit/cleanup policy. OTP and CAPTCHA response values are not stored long term.

## 16. SecretVault

```ts
interface SecretVault {
  seal(
    value: Uint8Array,
    context: SecretContext
  ): Promise<SealedSecret>;

  unseal(
    secret: SealedSecret,
    context: SecretContext
  ): Promise<Uint8Array>;

  rotate?(
    options: SecretRotationOptions
  ): Promise<SecretRotationResult>;
}
```

Initial implementation:

```text
LocalEncryptedVault
```

It uses an environment-provided master key, per-record nonces, authenticated encryption, and additional authenticated data bound to record type, record ID, owner, and plugin context. The database stores only ciphertext and encryption metadata.

Future implementations may use Vault, KMS, or OS keychain adapters without changing application contracts.

If encrypted records exist and the master key is unavailable, Source Reader starts in degraded mode. Public unauthenticated reading remains available. Secret-dependent operations return vault, credential, session, or network credential errors. Source Reader never generates a replacement key, deletes encrypted records, or falls back to plaintext automatically.

## 17. HTTP API

The internal TypeScript API remains authoritative. HTTP controllers call the same application use cases.

### 17.1 Reader endpoints

```http
POST /api/source-reader/identify
POST /api/source-reader/metadata
POST /api/source-reader/chapter-list
POST /api/source-reader/chapter-content
POST /api/source-reader/search
POST /api/source-reader/latest-updates
```

Clients may supply URLs, pagination, freshness preference, and authorized credential/network profile IDs. They cannot supply raw secrets, raw proxy URLs, plugin IDs, execution modes, worker paths, cache scopes, or permission overrides.

HTTP streaming for chapter lists is not required initially; internal `AsyncIterable` streaming is sufficient for crawler integration.

### 17.2 Plugin administration

```http
GET    /api/source-reader/plugins
GET    /api/source-reader/plugins/:pluginId
POST   /api/source-reader/plugins/install
POST   /api/source-reader/plugins/:pluginId/enable
POST   /api/source-reader/plugins/:pluginId/disable
DELETE /api/source-reader/plugins/:pluginId
POST   /api/source-reader/plugins/:pluginId/test
GET    /api/source-reader/plugins/:pluginId/health

GET  /api/source-reader/plugins/:pluginId/permissions
POST /api/source-reader/plugins/:pluginId/permissions/approve
POST /api/source-reader/plugins/:pluginId/permissions/deny
```

Package upload validation includes size limits, archive traversal prevention, symlink escape prevention, manifest validation, checksum/signature verification, contract compatibility, permission diff, quarantine, and atomic activation.

### 17.3 Credential and network management

```http
GET    /api/source-reader/credentials
POST   /api/source-reader/credentials
PATCH  /api/source-reader/credentials/:id
DELETE /api/source-reader/credentials/:id
POST   /api/source-reader/credentials/:id/login
POST   /api/source-reader/credentials/:id/logout
POST   /api/source-reader/credentials/:id/test

GET    /api/source-reader/network-profiles
POST   /api/source-reader/network-profiles
PATCH  /api/source-reader/network-profiles/:id
DELETE /api/source-reader/network-profiles/:id
POST   /api/source-reader/network-profiles/:id/test
```

Read responses expose metadata and health only, never plaintext or encrypted secret payloads.

### 17.4 Auth challenge management

```http
GET  /api/source-reader/auth/challenges
GET  /api/source-reader/auth/challenges/:id
POST /api/source-reader/auth/challenges/:id/respond
POST /api/source-reader/auth/challenges/:id/cancel
```

Browser interaction is exposed through a controlled application channel. Raw browser debugging endpoints are never exposed publicly.

### 17.5 Authorization roles

Minimum roles:

```text
reader
source-manager
source-admin
system-admin
```

- `reader`: uses authorized source-reading profiles.
- `source-manager`: manages personal credentials and network profiles.
- `source-admin`: installs, approves, enables, disables, tests, and quarantines plugins.
- `system-admin`: manages system credentials, system network routes, and trusted signing keys.

Authorization is enforced by application/controller policy, never delegated to plugin code.

## 18. Error Contract

```ts
interface SourceReaderErrorPayload {
  error: {
    code: SourceReaderErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: Record<string, unknown>;
  };
}
```

Core error codes include:

```text
SOURCE_NOT_SUPPORTED
CAPABILITY_NOT_SUPPORTED
PLUGIN_UNAVAILABLE
PLUGIN_DISABLED
PLUGIN_QUARANTINED
PLUGIN_CONTRACT_INCOMPATIBLE
PLUGIN_PERMISSION_DENIED
PLUGIN_NETWORK_PERMISSION_DENIED
PLUGIN_RESULT_INVALID

AUTHENTICATION_REQUIRED
AUTHENTICATION_FAILED
CREDENTIAL_NOT_CONFIGURED
SESSION_EXPIRED
SESSION_NETWORK_MISMATCH
AUTH_CHALLENGE_REQUIRED
AUTH_CHALLENGE_EXPIRED

NETWORK_ROUTE_REQUIRED
NETWORK_REGION_UNAVAILABLE
NETWORK_ROUTE_OFFLINE
NETWORK_ACCESS_BLOCKED

SOURCE_REQUEST_TIMEOUT
SOURCE_RESPONSE_TOO_LARGE
SOURCE_RATE_LIMITED
SOURCE_TEMPORARILY_UNAVAILABLE

CURSOR_INVALID
CURSOR_INVALIDATED

SECRET_VAULT_UNAVAILABLE
SOURCE_READER_CANCELLED
SOURCE_READER_INTERNAL_ERROR
```

Each error defines whether it is retryable, whether plugin fallback is allowed, and an optional retry delay. Frontend and crawler logic depend on the code, not on parsing message text.

Source Reader performs only bounded technical retries. Crawler owns business-level job retry policy.

## 19. Observability and Resilience

### 19.1 Correlation and logs

Each invocation carries:

- request ID;
- invocation ID;
- optional crawler job ID;
- plugin ID;
- capability;
- normalized domain;
- runtime mode;
- hashed network route identity;
- hashed credential scope identity.

Logs redact passwords, OTP values, cookies, authorization headers, proxy credentials, vault data, full chapter content, sensitive HTML, and token-like query parameters.

### 19.2 Metrics

Minimum metrics:

```text
source_reader_invocations_total
source_reader_invocation_duration_ms
source_reader_errors_total
source_reader_fallbacks_total
source_reader_cache_hits_total
source_reader_cache_stale_hits_total
source_reader_worker_restarts_total
source_reader_auth_challenges_total
source_reader_active_sessions
source_reader_network_route_health
```

Labels are bounded to plugin ID, capability, result, and runtime mode. URLs, user IDs, credential IDs, and session IDs are not metric labels.

### 19.3 Circuit breakers

Circuit breakers are scoped by plugin, capability, domain, and network route class. Authentication errors specific to one user do not reduce global plugin health.

When a circuit opens, registry selection skips that candidate and may use the next eligible plugin. Half-open probes or health checks restore availability.

### 19.4 Rate limiting

Three control layers apply:

```text
HTTP API rate limit by user
→ plugin invocation concurrency
→ source-domain/account/network-route request rate
```

Crawler may enqueue many jobs, but Source Reader retains authority over source-safe concurrency and request timing.

## 20. Source Reader and Crawler Responsibilities

### Source Reader owns

- plugin matching and capability selection;
- runtime requirements;
- auth, session, and network route resolution;
- HTTP/browser execution;
- parsing and normalized result validation;
- extension validation;
- technical retry and fallback;
- cache;
- plugin lifecycle, health, installation, and permissions.

### Crawler owns

- job creation and orchestration;
- queue and concurrency at the business-job level;
- scheduling;
- progress, pause, resume, and cancellation state;
- chapter selection and per-run limits;
- business-level retry timing;
- persistence of novels, chapters, and crawl tasks.

Source Reader never writes `novels`, `chapters`, or `crawl_tasks`.

## 21. Replacement of the Current System

The final implementation deletes the current source profile and old plugin reading paths, including their routes, DTOs, tests, and documentation.

Removal targets include the current equivalents of:

```text
crawler/domain/source/*
crawler/application/ports/source-adapter.port.ts
crawler/application/ports/source-detector.port.ts
crawler/application/services/source-detector.service.ts
crawler/application/use-cases/source-profiles/*
crawler/infrastructure/source/*
crawler/infrastructure/sources/plugin-source.adapter.ts
crawler/infrastructure/sources/selector-html.adapter.ts
modules/plugin/*
shared/container/modules/plugin.module.ts
apps/api/config/source-profiles.json
```

The exact file list is finalized against the implementation branch, but no compatibility classes remain. The old `GET /api/crawl/sources` contract is removed or replaced by Source Reader plugin/source endpoints rather than proxied.

The existing NovelCool selector logic becomes the first built-in Source Reader plugin with independently declared `identify`, `metadata`, `chapter-list`, and `chapter-content` capabilities.

Crawler and novel analysis use cases are rewritten to call `SourceReaderApi`. Search adopts the same façade when source search capabilities are used.

## 22. Maintenance and Cleanup

A Source Reader maintenance process handles only module-owned resources:

- expired auth challenges;
- expired/revoked sessions after retention;
- cache beyond `staleUntil`;
- failed temporary package installations;
- abandoned worker/browser contexts;
- persistent cache size limits;
- plugin health scheduling and stale health records.

It does not create or schedule crawl jobs.

## 23. Verification Strategy

### 23.1 Shared plugin contract suite

Every built-in and external plugin is tested for:

- valid manifest and SemVer range;
- capability-method agreement;
- normalized result schema;
- extension schema/version agreement;
- URL normalization;
- cancellation support;
- secret redaction and absence from results.

### 23.2 Registry and matcher tests

- exact and wildcard hosts;
- include/exclude path matching;
- per-capability priority;
- `canHandle` selection;
- multi-plugin domain composition;
- fallback ordering;
- disabled, degraded, quarantined, and incompatible plugins;
- contract-version filtering.

### 23.3 Runtime tests

- in-process invocation;
- isolated worker timeout and crash;
- cancellation and resource cleanup;
- module/network permission denial;
- response-size and redirect policy;
- worker termination after grace period;
- browser context isolation.

### 23.4 Auth and network tests

- explicit user profile over user default over system default;
- session isolation by account, user, and route;
- required network region and tags;
- no direct fallback when forbidden;
- OTP/challenge resume and expiration;
- credential deletion revokes sessions;
- route-bound session mismatch;
- missing vault key degraded behavior.

### 23.5 Cache isolation tests

- public, account, user, session, and none scopes;
- no premium/account data crossing scope boundaries;
- network region/route isolation;
- plugin and contract version invalidation;
- stale-while-revalidate restrictions;
- credential and route invalidation.

### 23.6 Package security tests

- archive path traversal;
- symlink escape;
- oversized archive/file count/expanded size;
- invalid checksum;
- invalid signature;
- invalid or malicious manifest;
- permission increase on update;
- no code execution before approval;
- local-unverified plugin forced into isolation;
- quarantine and atomic activation.

### 23.7 Crawler integration tests

- analyze a novel URL through Source Reader;
- persist normalized metadata;
- stream and persist complete chapter lists;
- fetch and persist chapter content;
- pause, resume, and cancel jobs;
- retry temporary source failures at crawler policy level;
- do not retry authentication-required failures as technical faults;
- preserve progress and error codes across module boundary.

### 23.8 Architecture tests

Forbidden imports include:

```text
crawler → source-reader infrastructure
crawler → plugin implementation
novels → source-reader SQLite repository
search → plugin registry
controller → SecretVault implementation
any module → source_reader_* tables outside Source Reader repositories
```

Allowed dependency:

```text
modules/source-reader/public/*
```

## 24. Acceptance Criteria

The redesign is complete only when all conditions hold:

1. Backend starts without `source-profiles.json`.
2. The old plugin module no longer exists.
3. Crawler contains no source adapter or source detector abstraction from the old path.
4. The built-in NovelCool plugin reads metadata, chapter list, and chapter content through Source Reader.
5. Multiple plugins can compose one domain by capability and fallback by priority.
6. Missing capability returns `CAPABILITY_NOT_SUPPORTED`.
7. External plugin code cannot execute before verification and approval.
8. Local-unverified plugins always run isolated.
9. Credentials, cookies, tokens, proxy secrets, and vault material never appear in logs or API responses.
10. Cache is isolated correctly for public, account, user, session, network, plugin version, and contract version.
11. Authentication challenges pause and resume successfully.
12. Region/network route requirements resolve before plugin invocation.
13. Missing vault keys degrade only secret-dependent operations.
14. Source Reader never writes novel, chapter, or crawl-task records.
15. Crawler uses only `SourceReaderApi` for source reads.
16. Old routes, contracts, tests, docs, profiles, fallbacks, and feature flags are removed.
17. Regression, integration, architecture, E2E, type-check, and build gates pass.
18. Final verification includes both `npm run verify` and `npm run test:e2e`.

## 25. Approved Decisions Summary

The following decisions are final for implementation planning:

- capability-based plugin contract;
- built-in and external plugin support;
- trusted in-process and untrusted isolated execution;
- restricted external `PluginContext` with allowlisted built-in access;
- per-capability multi-plugin composition with priority and fallback;
- weighted host/path matcher plus optional `canHandle`;
- authentication capability and runtime auth requirements;
- system and user credentials/network profiles;
- standard auth strategies plus custom auth extensions;
- isolated browser worker plus user-completed OTP/CAPTCHA/browser challenges;
- trust tiers and version-specific permission approval;
- `.source-plugin` archive format plus development-directory loading;
- SemVer plus per-capability contract versions;
- normalized data plus versioned namespaced extensions;
- cursor pagination plus internal streaming;
- multi-layer capability-aware cache;
- public/account/user/session/none cache scopes;
- complete replacement of legacy source profile and plugin paths;
- internal API as primary with restricted HTTP/admin APIs;
- strict Source Reader/Crawler responsibility boundary;
- Source Reader-owned tables in the existing SQLite database;
- `SecretVault` abstraction with an initial local encrypted backend.
