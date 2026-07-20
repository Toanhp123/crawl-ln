# Source Reader Security and Architecture Remediation Design

## 1. Status and Purpose

The Source Reader implementation at commit `5560397` completed the original implementation roadmap, but an independent design review found that several security and runtime invariants were not actually enforced by the production code. Existing regression and architecture gates passed because they did not exercise these boundaries behaviorally.

This design defines the remediation required before Source Reader external plugins, routed networking, authenticated scoped caching, and lifecycle activation can be considered production-ready.

The original Source Reader design remains authoritative for the module boundary and public feature set. This document narrows and strengthens the implementation requirements for:

- external plugin isolation;
- real network routing;
- cache and session identity;
- plugin lifecycle and compatibility;
- external authentication RPC;
- extension validation;
- structured logging and secret redaction;
- fail-closed migration of installed external plugins.

## 2. Goals

1. External plugins cannot access host files, spawn processes, open raw sockets, create workers, load native addons, or bypass host-managed network access.
2. Every selected network profile is applied to actual HTTP and browser traffic, with no direct fallback when routing is required.
3. Cache keys isolate public, account, user, and session data according to the original Source Reader contract.
4. Sessions are bound to plugin version, credential, owner, and network route and are invalidated when any binding changes.
5. Plugin activation is atomic and lifecycle-driven: compatibility, initialization, and health checks must pass before a version becomes active.
6. External plugin `canHandle`, custom authentication, and challenge resumption operate through explicit, schema-validated RPC operations.
7. Capability core results and extension values are validated against supported contract and extension schemas.
8. Plugin and host logging share one structured, redacting path that does not expose secrets or unbounded labels.
9. Existing external plugins are migrated fail-closed and must be revalidated before activation.
10. New behavioral security tests prove the boundary rather than relying only on import scans or unit stubs.

## 3. Non-Goals

- Supporting Node.js versions below 22 for external plugin execution.
- Supporting native addons, packaged binaries, or plugin-controlled subprocesses.
- Allowing plugins to initiate direct network traffic.
- Running or managing host-level VPN software from Source Reader.
- Preserving a legacy worker-thread execution mode for external plugins.
- Allowing administrators to bypass compatibility, sandbox, or health checks.
- Providing a temporary legacy activation mode during rollout.
- Returning stale authenticated cache entries.
- Allowing direct plugin writes to stdout or stderr.

## 4. Locked Decisions

The following decisions are approved and are requirements, not alternatives:

1. External plugins run in a dedicated Node.js 22+ child process.
2. External plugins are JavaScript/ESM only.
3. The child process uses a deny-by-default loader and Node permission controls.
4. Plugin packages cannot contain or load native addons or executable binaries.
5. Network profiles normalize to direct, HTTP proxy, HTTPS proxy, or SOCKS proxy routes.
6. The selected route applies to both host HTTP transport and Chromium.
7. Required routes fail closed; they never fall back to direct traffic.
8. Cache scope identity is distinct for public, account, user, and session scopes.
9. Stale-while-revalidate is allowed only for public cache entries.
10. Plugin activation is atomic and lifecycle-driven.
11. Runtime, capability, and extension compatibility is enforced strictly.
12. External custom authentication and `canHandle` use dedicated RPC operations.
13. Session binding includes plugin version, credential, owner, and network profile.
14. Form-login configuration belongs to a validated plugin manifest extension.
15. All host and plugin logs use one structured redacting logger.
16. Migration is fail-closed for all external plugins.
17. Implementation delivery stops after every three completed remediation tasks to commit and package a recoverable checkpoint ZIP.

## 5. Target Runtime Architecture

```text
Crawler / HTTP / Application Use Cases
                  |
           SourceReaderApi
                  |
      SourceReader Application Service
        |          |           |
   Registry    Runtime Context  Cache/Session
        |          |           |
   Runtime Router  |      Invalidation Service
        |          |
  +-----+----------+-----------------------------+
  |                                                    Host boundary
  |  Built-in runtime      External Process Supervisor
  |       |                         |
  |  In-process code          Typed RPC channel
  |                                 |
  |                      Node.js 22 sandbox process
  |                                 |
  +---------------------------------+------------------+
                                    |
                       Verified plugin package only

All HTTP, browser, secret, cache, clock, and logging operations remain in host code.
```

The application layer depends on ports. Infrastructure may replace the process sandbox implementation later with an OS container without changing Source Reader application services or plugin contracts.

## 6. External Plugin Process Sandbox

### 6.1 Process model

Each active external plugin version receives a dedicated supervised Node.js child process. A process may serve multiple invocations for that exact plugin version, but it cannot host unrelated packages.

The supervisor owns:

- process startup and termination;
- startup timeout;
- memory and CPU watchdogs where available;
- RPC framing and schema validation;
- protocol version negotiation;
- lifecycle state;
- health and policy-violation counters;
- forced termination after timeout or protocol breach.

External plugins no longer use worker threads as a security boundary.

### 6.2 Node version policy

External plugin execution requires Node.js 22 or newer. At application startup:

- built-in plugins may continue to run on supported application runtimes;
- if external plugins are enabled and Node is below the required version, Source Reader fails fast with a typed configuration error;
- the application must not silently fall back to the old worker runtime.

The required version is exposed in configuration and diagnostics.

### 6.3 Deny-by-default module loading

The sandbox starts with:

- a custom ESM loader;
- Node permission flags appropriate to the deployed Node 22 runtime;
- a minimal environment;
- no inherited application secrets;
- a fixed working directory inside the verified plugin package area.

The loader permits only:

- JavaScript or JSON modules within the verified package root;
- explicitly supported pure-JavaScript SDK modules supplied by Source Reader;
- standard modules on a small immutable allowlist when required for pure computation.

The loader rejects:

- absolute or relative paths escaping the package root;
- `node:fs` and filesystem aliases;
- `node:child_process`;
- `node:net`, `node:tls`, `node:dgram`, `node:http`, `node:https`, and direct socket libraries;
- `node:worker_threads`, `node:cluster`, and process-spawning APIs;
- native `.node` modules;
- executable or binary package content;
- dynamic module resolution outside the approved dependency graph;
- application-internal source paths.

Package verification rejects forbidden file types before activation. Runtime loader rejection remains a second boundary.

### 6.4 No direct network

The sandbox receives no usable network primitive. It cannot use global `fetch`, built-in HTTP modules, raw sockets, or third-party network libraries.

All network operations are requested from the host over typed RPC capability calls. The host applies permissions, route resolution, session attachment, rate limits, cancellation, timeout, redaction, and observability.

### 6.5 Standard output policy

Plugin code cannot use stdout or stderr as a logging interface. The supervisor captures both streams:

- protocol frames are accepted only on the dedicated RPC channel;
- unexpected stdout or stderr output is recorded as a bounded policy event;
- repeated violations degrade plugin health and may quarantine the version;
- raw stream content is never forwarded directly into application logs.

## 7. Typed Sandbox RPC Protocol

### 7.1 Operations

The protocol supports only the following plugin operations:

```text
initialize
healthCheck
shutdown
probeCanHandle
login
resumeChallenge
invokeCapability
log
```

Host services exposed to the plugin use separate request messages, such as:

```text
httpRequest
browserOperation
cacheGet
cacheSet
clockNow
urlNormalize
```

Every request and response includes:

- protocol version;
- request ID;
- plugin ID and version established by the supervisor, not trusted from plugin input;
- operation name;
- deadline;
- schema-versioned payload.

### 7.2 DTO isolation

The sandbox never receives the complete internal `PluginContext`. Each operation receives a purpose-specific DTO.

The plugin never receives:

- repositories;
- database handles;
- vault handles;
- ciphertext;
- application service objects;
- arbitrary actor data;
- raw network profile secrets;
- arbitrary session material;
- unrestricted environment variables.

### 7.3 Cancellation and timeouts

Host cancellation propagates to the sandbox request. When a request exceeds its deadline:

1. the supervisor sends cancellation;
2. a short grace period is allowed;
3. the process is terminated if it does not stop;
4. the failure is recorded against the relevant capability health state;
5. application fallback rules apply only where the original Source Reader contract permits fallback.

### 7.4 Schema validation

Both sides validate every message. Unknown operations, additional privileged fields, malformed identifiers, oversized payloads, or unsupported protocol versions are protocol violations.

Before recursive schema validation, the host performs an iterative structural preflight. A frame is rejected when it exceeds 32 levels of nesting, 10,000 traversed nodes, or approximately 512,000 serialized bytes. The preflight and schema parse are exception-safe so adversarial nesting cannot escape the supervisor message handler.

Capability invocation payloads are constructed from operation-specific allowlists. Actor ids, credential profile ids, network profile ids, request ids, and host cancellation objects are not copied into plugin capability DTOs unless the operation contract explicitly declares them.

The host rejects invalid plugin output before it reaches application result validation.

## 8. Real Network Routing

### 8.1 Normalized route contract

A resolved network route is one of:

```ts
interface DirectRoute {
  kind: 'direct';
  identity: string;
}

interface ProxyRoute {
  kind: 'http-proxy' | 'https-proxy' | 'socks-proxy';
  identity: string;
  endpoint: string;
  username?: string;
  passwordSecretRef?: string;
}

type ResolvedNetworkRoute = DirectRoute | ProxyRoute;
```

The application layer sees only route identity and requirements. Infrastructure resolves secret-backed proxy credentials immediately before transport construction.

### 8.2 HTTP transport

The host HTTP adapter receives a resolved route for every request. It creates or reuses a route-specific dispatcher/agent with bounded pooling.

The execution order is fixed:

```text
route resolution
-> session lookup and route-binding validation
-> rate limit
-> request construction
-> route-specific transport
-> response normalization and redaction
```

When a non-direct route is required:

- missing, invalid, offline, or unsupported routes return a typed routing error;
- no direct transport is attempted;
- fallback to another plugin does not bypass the request's required route policy.

### 8.3 Chromium routing

Browser identity includes route identity. Chromium is launched with proxy configuration matching the resolved HTTP, HTTPS, or SOCKS endpoint.

Browser pooling keys include:

- plugin ID and version;
- owner;
- credential;
- network route identity;
- session identity where relevant.

A route change closes incompatible browser identities and revokes bound sessions.

### 8.4 Route health testing

The network-profile test endpoint performs a real bounded request through the selected route to an approved diagnostic target. It returns measured latency and typed failure information.

It must not report a stored health value as if it were a live route test.

## 9. Cache Identity and Stale Policy

### 9.1 Cache key structure

Cache keys are generated from a canonical structure:

```ts
interface SourceReaderCacheIdentity {
  pluginId: string;
  pluginVersion: string;
  capability: SourceCapability;
  contractVersion: string;
  extensionContractVersions: Record<string, string>;
  normalizedRequestFingerprint: string;
  networkIdentity: string;
  scope: 'public' | 'account' | 'user' | 'session';
  scopeIdentity: string;
}
```

`scopeIdentity` is defined as:

- `public`: a fixed public constant;
- `account`: credential or source-account identity;
- `user`: authenticated actor ID;
- `session`: session record ID.

A shared `authScope` value must not be used for multiple cache scopes.

### 9.2 Persistent metadata

SQLite cache rows store real metadata:

```text
plugin_id
plugin_version
capability
contract_version
extension_contract_versions
scope
scope_identity_hash
network_identity_hash
request_fingerprint
expires_at
stale_until
tags
```

Sensitive identifiers are hashed where the raw value is not required for indexed invalidation.

### 9.3 Stale-while-revalidate

Only public entries may use stale-while-revalidate.

Public cache behavior:

1. before `expiresAt`: return fresh;
2. after `expiresAt` and before `staleUntil`: return stale with `STALE_CACHE_USED` and schedule one deduplicated refresh;
3. temporary refresh failure: retain stale until `staleUntil`;
4. after `staleUntil`: treat as miss.

Authenticated cache behavior:

- account, user, and session entries are misses immediately after `expiresAt`;
- they are never returned stale;
- stale fields may be omitted for those scopes.

Background refresh uses the same route, capability, compatibility, and validation rules as foreground reads.

## 10. Session Binding and Invalidation

### 10.1 Required binding

A session is identified by:

```text
pluginId
pluginVersion
credentialId
ownerId
networkProfileId or direct-route identity
```

Repository lookup must filter on the complete binding. A session created for an older plugin version cannot be reused by a newer version.

### 10.2 Central invalidation service

A single `SourceReaderInvalidationService` coordinates invalidation. It accepts typed events:

```text
credential-created
credential-updated
credential-deleted
session-revoked
logout
network-profile-updated
network-profile-deleted
network-health-invalidated
plugin-activated
plugin-upgraded
plugin-disabled
plugin-quarantined
chapter-list-version-changed
```

For each event it determines the affected scope and performs, in order:

1. revoke affected sessions when required;
2. close incompatible browser identities;
3. invalidate memory cache by indexed tags;
4. invalidate SQLite cache by indexed tags;
5. publish a bounded structured audit event.

The service must not delete unrelated public or other-user entries.

## 11. Plugin Lifecycle and Atomic Activation

### 11.1 Lifecycle contract

All plugins expose lifecycle behavior. Built-in plugins may use host adapters, while external plugins execute lifecycle calls over RPC.

```ts
interface PluginLifecycle {
  initialize(context: PluginLifecycleContext): Promise<void>;
  healthCheck(): Promise<PluginHealthResult>;
  shutdown(reason: PluginShutdownReason): Promise<void>;
}
```

Lifecycle context is restricted and contains no reader request, actor secret, repository, or network transport.

### 11.2 Activation sequence

Activation follows this exact sequence:

1. verify package checksum and signature policy;
2. scan package contents and imports for forbidden native/binary artifacts;
3. validate manifest syntax;
4. validate runtime SemVer compatibility;
5. validate capabilities and contract versions;
6. validate extension declarations and schemas;
7. validate requested permissions;
8. start the candidate sandbox process;
9. negotiate RPC protocol;
10. call `initialize`;
11. call `healthCheck`;
12. atomically persist the candidate as active and publish a new registry snapshot;
13. verify the new snapshot can resolve the plugin;
14. call `shutdown` on the previous version;
15. retire the previous process.

If a step before registry publication fails:

- the existing registry and active version remain unchanged;
- the candidate process is terminated;
- the candidate remains `installed` for operational failure or becomes `quarantined` for integrity, policy, or compatibility failure;
- a typed activation result and health event are recorded.

If shutdown of the old version fails after the new version is active, the supervisor force-terminates the old process and records a warning without rolling back the healthy new version.

### 11.3 Disable and quarantine

Disable removes the version from a new registry snapshot before shutdown. Quarantine also prevents future process startup until a new verified package version or explicit remediation action is supplied.

No API supports force-enabling an incompatible or policy-violating package.

## 12. Compatibility and Contract Validation

### 12.1 Host compatibility declaration

Source Reader publishes:

- runtime version;
- sandbox protocol version;
- supported capability contract versions;
- supported extension namespaces and versions;
- supported permission names.

### 12.2 Install and activation validation

`engines.sourceReader` must be a valid SemVer range satisfied by the running Source Reader version.

Each declared capability must:

- be known to the host;
- specify a supported contract version;
- provide the required implementation operation.

Compatibility failures are typed:

```ts
interface CompatibilityIssue {
  code: string;
  path: string;
  severity: 'warning' | 'fatal';
  message: string;
}
```

Fatal compatibility issues quarantine the package. Warnings remain visible in package diagnostics and health events.

### 12.3 Extension declarations

For each extension namespace:

- namespace and version must be supported;
- the declared schema must compile;
- required extensions must validate or activation fails;
- optional invalid extensions are disabled and recorded as warnings;
- result validation uses the activated extension set, not untrusted invocation output.

### 12.4 Capability result validation

Every capability has a concrete core schema. `search` and `latestUpdates` item arrays cannot use `unknown` elements.

Validation order:

1. validate sandbox RPC response envelope;
2. validate core capability result;
3. validate each declared extension value;
4. remove optional invalid extensions and append warnings;
5. fail with `PLUGIN_RESULT_INVALID` for core or required extension violations.

Opaque cursors bind the capability contract and all relevant extension contract versions.

## 13. External Authentication

### 13.1 Standard strategies

Standard authentication remains host-managed. Form-login configuration is provided by a validated manifest extension containing:

- login URL template restricted to plugin matchers;
- allowed HTTP method;
- credential field mapping;
- static non-secret fields;
- success and failure detectors;
- challenge declarations;
- session extraction rules.

Administrators supply only credential values defined by the schema. They cannot provide arbitrary selectors, URLs, scripts, or header injection.

### 13.2 Custom authentication RPC

External custom authentication uses dedicated `login` and `resumeChallenge` operations.

The host:

- resolves and decrypts credentials;
- filters allowed fields according to the activated authentication schema;
- applies route policy;
- performs host HTTP/browser operations requested through RPC;
- encrypts stored session material;
- binds the session to plugin version and route;
- persists and resumes challenges;
- revokes sessions and invalidates cache on logout or binding changes.

The plugin receives only the schema-approved auth DTO and opaque host operation results. It never receives vault access, ciphertext, repositories, or unrelated actor data.

### 13.3 `canHandle`

External `canHandle` runs through `probeCanHandle` with a restricted probe DTO containing only normalized URL/domain information and non-secret request characteristics. It does not receive full runtime context, credentials, sessions, browser operations, or cache access.

## 14. Structured Logging and Redaction

### 14.1 One logging boundary

Host and plugin logs are processed by one `SourceReaderStructuredLogger`.

Plugin log RPC accepts only:

```ts
interface PluginLogEvent {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  metadata?: Record<string, unknown>;
}
```

The host attaches trusted fields:

- request ID;
- plugin ID and version;
- capability;
- actor category without user-provided labels;
- route type without secret endpoint credentials.

### 14.2 Limits and redaction

The logger:

- bounds message and metadata size;
- bounds nesting depth and array length;
- accepts only allowlisted metadata keys;
- redacts passwords, tokens, cookies, authorization values, OTPs, session values, and proxy credentials;
- normalizes URLs and removes sensitive query values;
- refuses raw response bodies, HTML, chapter content, and binary data;
- prevents plugin-defined unbounded metric label names or values.

Policy violations affect health counters. Repeated violations may open the plugin circuit or quarantine the version according to configured thresholds.

## 15. Fail-Closed Migration and Rollout

### 15.1 Migration state

On the first startup after this remediation migration:

- built-in plugin activation is unchanged;
- every external active version is removed from the active registry;
- verified packages transition to `installed-pending-revalidation` or equivalent non-active state;
- packages with missing or changed files transition to `quarantined`;
- external sessions are revoked because their execution and version binding must be re-established;
- external authenticated cache entries are invalidated;
- public cache may remain only when its plugin version and contracts remain identical and policy explicitly permits it; the default migration invalidates it for simplicity and safety.

### 15.2 Revalidation

Each external version must pass the complete activation sequence before becoming active again. There is no legacy sandbox mode and no force-enable route.

Diagnostics must explain why a version remains inactive or quarantined.

### 15.3 Operational rollback

Application rollback to an older release must not reactivate external plugins automatically. Migration records and plugin status remain fail-closed until the older release is explicitly assessed as safe. Database migration design must therefore avoid interpreting unknown new statuses as active.

## 16. Error Model

New typed errors include, at minimum:

```text
EXTERNAL_RUNTIME_UNSUPPORTED
PLUGIN_SANDBOX_START_FAILED
PLUGIN_SANDBOX_POLICY_VIOLATION
PLUGIN_RPC_PROTOCOL_INVALID
PLUGIN_RUNTIME_INCOMPATIBLE
PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED
PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED
PLUGIN_EXTENSION_SCHEMA_INVALID
PLUGIN_LIFECYCLE_FAILED
NETWORK_ROUTE_UNAVAILABLE
NETWORK_ROUTE_UNSUPPORTED
NETWORK_ROUTE_TEST_FAILED
SESSION_BINDING_MISMATCH
CACHE_SCOPE_IDENTITY_MISSING
```

Errors crossing the public API preserve stable machine-readable codes and safe details. Secret values, filesystem paths outside approved diagnostics, raw proxy endpoints with credentials, and plugin output bodies are never included.

## 17. Testing Strategy

### 17.1 Sandbox behavioral tests

Tests execute hostile fixture plugins through the production sandbox and prove they cannot:

- read a host file;
- import filesystem APIs;
- spawn a shell or process;
- import raw network modules;
- open a socket;
- create worker threads;
- access application environment secrets;
- load a native addon;
- escape the verified package root;
- write uncontrolled stdout or stderr;
- call an undeclared RPC operation.

Tests also prove allowed pure computation and typed host RPC still work.

Static import scanning remains defense in depth but is not accepted as the only sandbox test.

### 17.2 Network routing tests

Integration tests use local direct and proxy test servers to prove:

- HTTP traffic reaches the destination through the selected HTTP/HTTPS/SOCKS route;
- required route failure never contacts the destination directly;
- route credentials are applied without entering logs;
- Chromium receives and uses the selected proxy;
- browser identity changes when route identity changes;
- route-bound sessions cannot be reused on another route.

### 17.3 Cache and session tests

Tests prove:

- public entries are shared;
- account entries are separated by credential identity;
- user entries are separated by actor identity even with a shared system credential;
- session entries are separated by session ID;
- plugin version, contracts, extensions, and network identity affect keys;
- only public cache can return stale;
- invalidation events delete only affected rows;
- old-version sessions are rejected.

### 17.4 Lifecycle and compatibility tests

Tests prove:

- activation does not publish a candidate before health succeeds;
- lifecycle failure preserves the old active version;
- new active publication precedes old shutdown;
- unsupported runtime ranges and contracts quarantine packages;
- required extension failures block activation;
- optional extension failures produce warnings and omit only that extension;
- package native/binary content is rejected.

### 17.5 Authentication and logging tests

Tests prove:

- external `probeCanHandle`, `login`, and `resumeChallenge` travel through dedicated DTOs;
- plugin version and route are part of session lookup;
- form-login accepts only manifest-declared fields and destinations;
- secrets do not appear in host logs, plugin logs, metrics, exceptions, or test snapshots;
- uncontrolled sandbox output becomes a policy event, not raw application log content.

### 17.6 Acceptance gates

The remediation is complete only when:

- all new behavioral security suites pass;
- existing Source Reader regression and integration suites pass;
- architecture gates prevent reintroduction of worker-thread external execution and direct plugin networking;
- package, typecheck, format, build, and E2E gates pass;
- exact `npm run verify` exits with code 0;
- the final forbidden-symbol and forbidden-runtime scan is clean.

## 18. Implementation Sequencing

Implementation will be divided into focused tasks with test-first commits. The detailed implementation plan will prioritize critical findings before major findings.

Delivery rule:

- complete at most three implementation tasks in one batch;
- after the third completed task, stop implementation immediately;
- run the batch verification checklist;
- commit checkpoint metadata;
- create a recoverable ZIP containing Git history and a SHA-256 checksum;
- begin the next task only in a later user-approved continuation.

The first remediation batch should cover:

1. external process sandbox and behavioral escape tests;
2. real HTTP and Chromium network routing with no direct fallback;
3. cache identity separation and session-version binding.

Subsequent batches cover lifecycle/compatibility, external authentication and extension validation, invalidation/stale behavior, logging hardening, migration, and final acceptance.

## 19. Design Review Checklist

- No placeholders or unresolved alternatives remain.
- Node.js 22+, process isolation, JavaScript/ESM-only packaging, and fail-closed rollout are explicit.
- HTTP and browser routing share the same resolved route identity.
- Cache scope identities are distinct and authenticated stale data is forbidden.
- Lifecycle publication and rollback ordering is defined.
- Compatibility and extension validation behavior is deterministic.
- External authentication DTO boundaries are explicit.
- Logging policy covers plugin output and host metadata.
- Behavioral security tests are required, not optional.
- Three-task checkpoint packaging is part of the delivery process.


## 20. Implemented Remediation Evidence

The approved design is implemented on branch `feat/source-reader` through twelve test-first tasks.

Security boundary evidence:

- external plugins execute in supervised Node.js 22+ child processes with the deny-by-default module loader and SES compartment;
- Node permission controls are defense in depth, while SES and the loader are the language-level authority boundary;
- HTTP and Chromium traffic use resolved HTTP/HTTPS/SOCKS route identities with no direct fallback when routing is required;
- cache keys separate public, account, user, and session identity and bind plugin, contract, extension, request, and network identities;
- lifecycle activation publishes only after initialize and health-check success;
- compatibility, extension schemas, package formats, dedicated authentication RPC, session bindings, centralized invalidation, and structured redaction are behaviorally tested;
- migration 22 disables all previously active external plugins, revokes their sessions, deletes their cache, and requires integrity revalidation before reactivation;
- the legacy worker-thread plugin runtime has been deleted and architecture gates prevent its return.

Final acceptance requires exact exit code 0 from `npm run verify` and `npm run test:e2e`, plus a recoverable final ZIP with Git history and SHA-256 checksum. Exact counts and commit identifiers are recorded in `docs/superpowers/checkpoints/2026-07-20-source-reader-remediation.md`.
