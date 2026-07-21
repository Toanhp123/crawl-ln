# Source Plugin SDK Design

## Goal

Create an official `@novel-tool/source-plugin-sdk` workspace package that is the canonical TypeScript contract for external Source Reader plugins. Public plugin documentation and examples remain deferred until this package and its runtime integration are complete.

## Scope

The SDK covers only contracts that external plugin authors consume:

- manifest and matcher types;
- capability names and capability-to-method mapping;
- normalized source models;
- capability request and result types;
- asynchronous sandbox context types;
- lifecycle, probing, authentication, and challenge operations;
- cache hints, warnings, and extension values;
- typed plugin errors that the host safely preserves;
- type-preserving helpers for plugin and manifest definitions.

The SDK does not expose application services, repositories, administration DTOs, user identities, credential material, network profile internals, or the synchronous built-in `PluginContext`.

## Package shape

```text
packages/source-plugin-sdk/
├── package.json
├── tsconfig.json
└── src/
    ├── capabilities.ts
    ├── context.ts
    ├── errors.ts
    ├── index.ts
    ├── manifest.ts
    ├── models.ts
    └── plugin.ts
```

Package properties:

- name: `@novel-tool/source-plugin-sdk`;
- version: `2.9.6`, aligned with the host release;
- ESM output with declarations;
- zero runtime dependencies;
- Node engine floor `>=22.12.0`, matching the sandbox host;
- root export only for the first stable surface.

## Canonical boundaries

### Shared normalized contracts

The SDK becomes the source of truth for:

- `SourceCapability`;
- `CacheScope`;
- `Page<T>`;
- `SourceIdentity`;
- `NovelMetadata`;
- `ChapterSummary`;
- `ChapterContent`;
- `NovelSearchResult`;
- `LatestUpdate`;
- `VersionedExtensionValue`;
- `SourceReaderWarning`;
- `PluginOperationResult<T>`;
- authentication session/challenge/result models;
- lifecycle request/result models;
- `SourcePluginManifest` and nested manifest models.

The API public module re-exports these types instead of redefining them. Host-only request context and `SourceReaderResult<T>` remain in the API.

### Built-in plugin boundary

Built-in plugins continue to use the internal synchronous `PluginContext`. The internal `SourceReaderPlugin` interface imports SDK models and manifest types but retains synchronous HTML and URL operations.

### External plugin boundary

The SDK exports `ExternalPluginContext`, matching the sandbox exactly:

- `html.load()` returns a document proxy synchronously;
- document and node operations return promises;
- URL normalization and resolution return promises because they cross RPC;
- logger operations return promises;
- `clock.now()` is synchronous invocation time;
- `host.clockNow()` returns current host time asynchronously;
- cancellation exposes only `readonly aborted: boolean`;
- `normalizedUrl` is invocation metadata;
- browser is optional.

The external plugin interface uses the exact runtime method names:

- capabilities: `identify`, `readMetadata`, `readChapterList`, `readChapterContent`, `search`, `latestUpdates`;
- selection: `probeCanHandle`;
- lifecycle: `initialize`, `healthCheck`, `shutdown`;
- authentication: `login`, `resumeChallenge`.

The low-level `invokeCapability(payload, context)` escape hatch is typed separately and is not the primary API.

## Type helpers and sandbox imports

The package exports:

```ts
function defineSourcePlugin<T extends ExternalSourcePlugin>(plugin: T): T;
function defineSourcePluginManifest<T extends SourcePluginManifest>(manifest: T): T;
```

External plugin source may use these helpers when its bundler inlines the SDK. The no-bundler path uses type-only imports and `satisfies`, which emit no sandbox import:

```ts
import type { ExternalSourcePlugin } from '@novel-tool/source-plugin-sdk';

const plugin = { /* ... */ } satisfies ExternalSourcePlugin;
export default plugin;
```

The initial implementation does not relax sandbox bare-module policy. This keeps the SDK usable without increasing runtime authority and avoids coupling plugin execution to the host installation layout.

## Typed errors

The SDK exports `SourcePluginError` and a constrained `SourcePluginErrorCode` union containing only errors an external plugin may legitimately report:

- `AUTHENTICATION_REQUIRED`;
- `AUTHENTICATION_FAILED`;
- `NETWORK_ACCESS_BLOCKED`;
- `SOURCE_RESPONSE_TOO_LARGE`;
- `SOURCE_RATE_LIMITED`;
- `SOURCE_TEMPORARILY_UNAVAILABLE`;
- `UPSTREAM_CHALLENGE_DETECTED`;
- `CURSOR_INVALID`;
- `PLUGIN_RESULT_INVALID`;
- `SOURCE_READER_CANCELLED`.

The sandbox supervisor preserves only this allowlist. Unknown or host-internal codes remain `PLUGIN_UNAVAILABLE`. Retry and fallback policy is owned by the host and mapped per code; plugins cannot set those flags.

## Build integration

A new `scripts/prepare-sdk.mjs` compiles the SDK once. Root commands prepare both shared packages through `scripts/prepare-packages.mjs`:

- `dev`, `check`, `build`, integration tests, and `verify` call the package preparation step;
- `check:prepared` checks the SDK source when TypeScript checking is enabled;
- production API compilation resolves SDK declarations from `dist`;
- lockfile records the API workspace dependency.

The existing command graph remains non-nested and cross-platform.

## Compatibility and drift prevention

Tests enforce:

1. SDK capability constants match manifest validation and sandbox dispatch.
2. External HTML/URL/logger signatures match the actual RPC behavior.
3. API normalized public models are re-exported from the SDK.
4. Manifest schema accepts a valid SDK manifest and rejects invalid values.
5. An external plugin fixture type-checks using only the SDK.
6. `SourcePluginError` safe codes survive the sandbox boundary; unknown codes do not.
7. The SDK package builds declarations and contains no dependency on API source.
8. Existing built-in and external plugin tests remain green.

## Non-goals

- publishing to the public npm registry;
- generating public plugin documentation in this change;
- adding a CLI or package builder;
- allowing arbitrary package imports inside the sandbox;
- unifying synchronous built-in context with asynchronous external context;
- changing capability result validation or manifest package format.

## Acceptance criteria

- `@novel-tool/source-plugin-sdk` builds as an independent workspace package;
- external plugin authors can type every supported operation without importing API internals;
- API and sandbox consume or verify the same canonical contract;
- no type-only import remains in emitted plugin JavaScript;
- safe plugin error codes retain their meaning across the process boundary;
- `npm run verify` passes from a clean checkout;
- no public tutorial/reference docs are added yet.
