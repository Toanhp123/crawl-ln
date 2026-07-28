# Plugin Development

Source plugins provide website-specific identification and parsing while the host owns networking, credentials, browser access, caching, cancellation, and persistence. The host discovers plugin workspaces without provider-specific code.

## Capabilities

A plugin can declare `identify`, `metadata`, `chapter-list`, `chapter-content`, `search`, `latest-updates`, and optional `authentication` capabilities. Each capability has a contract version and matchers define supported hosts and paths.

Minimal manifest shape:

```json
{
  "id": "example-source",
  "name": "Example Source",
  "version": "1.0.0",
  "engines": { "sourceReader": "^1.0.0" },
  "capabilities": ["identify", "metadata", "chapter-list", "chapter-content"],
  "contracts": {
    "identify": 1,
    "metadata": 1,
    "chapter-list": 1,
    "chapter-content": 1
  },
  "matchers": [{ "hosts": ["example.com"], "include": ["/novel/**"] }],
  "runtime": { "preferredMode": "isolated" },
  "permissions": { "network": { "hosts": ["example.com"] } }
}
```

## Runtime Contract

Import types and helpers from `@novel-tool/source-plugin-sdk`. Do not import host application modules or access the filesystem, network, browser, or secrets directly. Use the purpose-specific context operations supplied by the SDK; they are validated and mediated by the host.

An external plugin runs in `isolated` mode in a supervised process. Malformed results, protocol violations, package mutation, repeated policy violations, or unsupported contracts can disable or quarantine a version.

## Package Layout

The installable archive is a ZIP with this layout:

```text
manifest.json
checksums.json
dist/
  index.js
assets/                 # optional and declared in the manifest
signature.json          # optional for signed distribution
```

`checksums.json` contains a SHA-256 digest for every package file except the checksum and signature documents. Paths must be relative and safe. Native addons, symbolic links, executable permission bits, unexpected files, and executable binary payloads are rejected.

## Build and Test

Keep source and tests in a workspace with `manifest.json`, `src/index.ts`, and optional `tests/`. The repository build, check, and test commands discover plugin workspaces automatically:

```bash
npm run check
npm test
npm run build
```

The build creates a `.source-plugin` archive. The web console accepts both `.source-plugin` and `.zip`; the extension is only a picker hint and the backend validates the contents.

## Install or Import

These actions are intentionally separate:

```text
Install package: validate -> build source when needed -> verify -> pending approval
Import project: validate source layout -> create/update Studio project -> open editor
```

Manual install never creates a Studio project. Import project never builds, installs, approves, or enables a plugin. Review the archive preview and checksum before confirming either action.

External activation is explicit: `Install -> Approve -> Enable`. The management API keeps `latestVersion` (the newest installed candidate) separate from `activeVersion` (the version currently enabled). A locally built unsigned package is reported as `local-unverified`; this is expected until a trusted signing channel is used. If no enabled candidate matches a URL, there is no built-in fallback.

## First-party Example

`npm run build` creates `dist/plugins/novelcool-1.0.0.source-plugin`. Upload it from `/sources/new`, approve `novelcool.com` and `*.novelcool.com`, then enable version `1.0.0` from `/sources`.

Publish a new version instead of mutating an installed archive. A changed archive fails integrity verification and can quarantine the affected version.
