# External Plugin Transparency and Activation Design

## Context

NovelCool now runs as an external source plugin, but two boundaries remain incomplete:

1. Repository orchestration still names the NovelCool workspace directly in build, check, test,
   and clean commands, and ingestion still contains a NovelCool-specific cleanup rule.
2. The plugin list contract exposes only `activeVersion`. A newly installed plugin has no active
   version, so the web application has no exact version to approve or enable.

The confirmed product flow is explicit and sequential:

1. Install a package.
2. Review and approve the requested permissions for one exact version.
3. Enable that exact approved version.

Enabling a plugin must never approve permissions implicitly.

## Goals

- Remove plugin-specific knowledge from host application code and repository orchestration.
- Preserve the external process, public SDK, manual installation, and explicit approval boundary.
- Give the frontend an exact installed version for permission review and activation without
  misusing `activeVersion`.
- Keep the design valid when there are zero, one, or multiple first-party plugin workspaces.
- Make moving NovelCool to another repository possible without editing host build, check, test,
  or clean logic.
- Prevent the same coupling and activation regression from returning.

## Non-goals

- Moving NovelCool to a separate repository in this change.
- Automatically installing, approving, or enabling any plugin during setup, build, or start.
- Moving source-specific parsing or sanitization into the host or SDK.
- Changing package signing or the `local-unverified` trust classification.
- Building a complete multi-version rollback interface.

## Boundary Model

The host and plugin have different responsibilities.

The host owns privileged and cross-cutting facilities:

- HTTP and browser access
- HTML document handles
- URL normalization and resolution
- cache, clock, logging, cancellation, credentials, and network policy
- package verification, permissions, lifecycle, isolation, and persistence

An external plugin accesses those facilities only through `ExternalPluginContext` and the public
Source Plugin SDK. Plugin production source may import the SDK and local modules. It must not
import host application code, Node built-ins, or unmediated network, filesystem, process, or
browser APIs.

The plugin owns pure source-domain behavior:

- host and path recognition
- selectors and page classification
- chapter alias rules
- source-specific parsing and text cleanup
- bounded source-specific diagnostics

Standard language facilities such as `URL`, `RegExp`, `Map`, `JSON`, and pure local functions are
not host services and remain valid inside the plugin.

## Generic Plugin Workspace Discovery

Add one repository utility that discovers direct children of `plugins/`. Each discovered workspace
must contain a valid `package.json`, `manifest.json`, and the command-specific files it declares.
The utility returns a stable list sorted by manifest ID and includes:

- absolute workspace path
- npm workspace name
- manifest ID and version
- TypeScript configuration path when present
- generated `dist` path

Discovery validates duplicate IDs and duplicate artifact identities before any command performs
work. Invalid workspaces fail with a clear repository command error.

Repository commands consume this list:

- Full build packages every discovered plugin with the production verifier.
- Plugin tests run each discovered workspace's `test` script in stable order.
- Static type checks include each discovered plugin TypeScript configuration.
- Clean removes each discovered plugin's generated `dist` and build-info files.

With no plugin workspaces, all four commands remain valid and emit no plugin artifacts. No command
contains the string `novelcool` or assumes a particular first-party plugin exists.

## Repository Boundary Enforcement

The boundary checker reads discovered plugin manifests and enforces both directions:

- Host application and package source cannot import plugin source.
- Plugin production source cannot import host application source.
- Plugin production source may use only local imports and the public Source Plugin SDK.
- Host application and package source cannot contain a discovered plugin ID or declared domain.
- Built-in paths derived from discovered plugin IDs are forbidden.

Tests, fixtures, documentation, and plugin workspaces may name a plugin when that identity is the
subject being tested or documented. Generic repository orchestration may read plugin manifests but
must not contain a concrete plugin identity.

The existing `novelcool.com` filter is removed from ingestion. NovelCool already owns that cleanup
inside its plugin sanitizer, so removing the host rule eliminates duplication without losing the
current external-plugin behavior.

## Plugin Descriptor Contract

Extend `SourceReaderPluginDescriptor` with a required `latestVersion`:

```ts
interface SourceReaderPluginDescriptor {
  id: string;
  name: string;
  latestVersion: string;
  activeVersion?: string;
  // existing trust, status, capability, domain, permission, and health fields
}
```

The meanings are strict:

- `latestVersion` is the newest installed version selected by the repository's existing latest
  version ordering. It is the version presented for review and the version targeted by a new
  activation or upgrade.
- `activeVersion` exists only when a version is currently active. It must never be populated merely
  to make an inactive plugin actionable.
- `enabled` describes whether an active version exists.
- `permissionsPending` describes the requested permissions for `latestVersion`.
- trust level, capabilities, and domains shown for review come from `latestVersion`.
- aggregate lifecycle `status` continues to describe the plugin's current host state.

The SQLite query selects the latest installed version independently from `active_version`, joins
the latest manifest, and computes pending permissions against that exact version.

Approval and enable routes continue to require a version in the request body. The server never
infers a version at mutation time because that could approve or activate a package different from
the one the user reviewed.

## Frontend Flow

The entity normalizer requires `latestVersion` and preserves `activeVersion` separately.

For an inactive plugin:

1. Details show the installed `latestVersion`.
2. Permission review sends `latestVersion` to the approve or deny endpoint.
3. While `permissionsPending` is true, the Enable switch is disabled and explains that approval is
   required first.
4. Approval invalidates plugin list, detail, permission, and health queries.
5. Once the refreshed descriptor reports `permissionsPending=false`, Enable sends the same
   `latestVersion` to the activation endpoint.

For an active plugin:

- The switch controls the current active state.
- Details show both versions when `latestVersion !== activeVersion`.
- A separate activate-latest action can target the reviewed latest version without pretending the
  current switch is off. This action follows the same explicit approval gate.

The backend remains authoritative. A direct enable request for an unapproved version still returns
`PLUGIN_PERMISSION_DENIED`, and the frontend surfaces that public error after rolling back its
optimistic state.

## Data Flow

```text
package install
  -> verified version persisted
  -> requested permissions persisted as pending
  -> list returns latestVersion, no activeVersion, permissionsPending=true
  -> user approves latestVersion
  -> list refresh returns permissionsPending=false
  -> user enables latestVersion
  -> activation service verifies exact-version approval
  -> isolated process initializes and passes health check
  -> store and registry publish activeVersion atomically
```

No step combines approval with activation.

## Error Handling

- Missing or malformed `latestVersion` is an invalid API descriptor, not a signal to guess.
- A missing requested version returns `PLUGIN_UNAVAILABLE`.
- Pending or denied permissions return `PLUGIN_PERMISSION_DENIED`.
- Compatibility and lifecycle failures retain the existing quarantine and rollback behavior.
- A malformed plugin workspace fails discovery before build, check, test, or clean performs plugin
  work.
- Duplicate plugin IDs or artifact identities fail deterministically.
- Zero discovered plugin workspaces is a supported state, not an error.

## Test Strategy

Implementation follows red-green-refactor. Required regression coverage:

1. SQLite listing returns `latestVersion=2.0.0`, omits `activeVersion`, and reports pending
   permissions immediately after installation.
2. Approval changes only the permission state; it does not activate the plugin.
3. Enable rejects an unapproved exact version and succeeds after approval.
4. Web normalization retains `latestVersion` and does not fabricate `activeVersion`.
5. The Enable control is unavailable while permissions are pending and targets `latestVersion`
   after approval.
6. The real generated NovelCool package completes install, approve, enable, invoke, and disable
   through production services.
7. Workspace discovery covers zero, one, multiple, malformed, and duplicate plugin workspaces.
8. Build, check, test, and clean consume discovery without a concrete plugin name.
9. Repository boundaries reject plugin identities in host source, host imports in plugin source,
   plugin imports in host source, Node imports, direct fetch, and unsupported bare imports.
10. Full check, core tests, build, and targeted E2E pass after the change.

## Acceptance Criteria

- No production source under `apps/*/src` or `packages/*/src` contains NovelCool-specific behavior.
- No build, check, test, or clean implementation names NovelCool.
- NovelCool production source imports only the public SDK and local modules and uses host context
  for privileged operations.
- A newly installed plugin can be approved and then enabled from the web application after a page
  reload.
- Approval remains explicit, exact-version scoped, and separate from activation.
- `activeVersion` always means an actually active version.
- Removing `plugins/novelcool` later requires no host command implementation changes.
