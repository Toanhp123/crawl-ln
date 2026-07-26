# External Plugin Transparency and Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Make plugin orchestration identity-agnostic and make the explicit 'Approve -> Enable' flow work for an installed but inactive plugin without weakening the external sandbox boundary.

**Architecture:** The repository discovers plugin workspaces from their manifests instead of naming a provider. Host runtime and package code remain provider-neutral; source-specific parsing stays inside the isolated plugin. The management descriptor exposes 'latestVersion' separately from the actual 'activeVersion', and every mutation carries the exact reviewed version.

**Tech Stack:** Node 22, TypeScript, SQLite, Express, React, TanStack Query, npm workspaces, Node test runner, Playwright, esbuild, existing Source Plugin SDK and sandbox RPC.

## Global Constraints

- Approval is explicit, exact-version scoped, and always occurs before activation.
- 'activeVersion' means an actually active version; it must never be filled in to make an inactive plugin actionable.
- 'latestVersion' is the newest installed candidate used for permission review and activation.
- Setup, build, start, and tests must not install, approve, or activate a plugin implicitly.
- Host application/package source cannot contain a discovered plugin ID or declared domain.
- Plugin production source may import only local modules and '@novel-tool/source-plugin-sdk'.
- Plugin privileged operations use 'ExternalPluginContext'; source-specific parsing and sanitization stay local to the plugin.
- Zero plugin workspaces is a valid state for build, check, test, and clean.
- Do not add runtime dependencies to the zero-dependency Source Plugin SDK.
- Use ASCII source and documentation text unless an existing file requires otherwise.

## File Map

Create:

- 'scripts/cli/lib/source-plugin-workspaces.mjs' - manifest-driven workspace discovery and validation.
- 'apps/web/src/features/manage-source-plugins/model/source-plugin-activation-state.ts' - pure version-aware activation gating used by the web controls.
- 'tests/regression/source-plugin-workspace-discovery.test.ts' - discovery fixtures and duplicate/invalid cases.
- 'tests/regression/source-plugin-version-contract.test.ts' - latest-versus-active persistence contract.
- 'tests/regression/web-source-plugin-activation.test.ts' - frontend descriptor and approval gating behavior.

Modify:

- 'scripts/cli/commands/build.mjs' - package every discovered workspace.
- 'scripts/cli/commands/check.mjs' - type-check discovered plugin projects.
- 'scripts/cli/commands/test.mjs' - run discovered plugin test scripts.
- 'scripts/cli/commands/clean.mjs' - remove discovered plugin artifacts.
- 'scripts/cli/lib/repository-boundaries.mjs' - enforce manifest-derived host/plugin boundaries.
- 'apps/api/src/modules/ingestion/application/services/chapter-fetch.service.ts' - remove the provider-specific URL filter.
- 'packages/shared/src/index.ts' - publish 'latestVersion' in the shared descriptor.
- 'apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts' - require 'latestVersion' from 'listInstalled'.
- 'apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts' - select latest version independently from active version.
- 'apps/web/src/entities/source-plugin/api/source-plugin-api.ts' - normalize the new contract without fabricating 'activeVersion'.
- 'apps/web/src/features/manage-source-plugins/api/manage-source-plugins.ts' - expose exact-version activation.
- 'apps/web/src/features/manage-source-plugins/model/create-plugin-toggle-action.ts' - require an exact target version.
- 'apps/web/src/features/manage-source-plugins/model/use-source-plugin-actions.ts' - target 'latestVersion' and expose latest activation.
- 'apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx' - gate Enable while permissions are pending and render latest activation.
- 'apps/web/src/features/manage-source-plugins/i18n/catalog.ts' - add approval-gate and latest-activation copy.
- 'apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx' - display latest/active versions and pass 'latestVersion' to permission review.
- 'apps/web/src/features/review-source-permissions/ui/ReviewSourcePermissions.tsx' - review the exact latest version.
- 'apps/web/src/features/review-source-permissions/model/use-review-source-permissions.ts' - require the exact version.
- 'tests/regression/novelcool-external-boundary.test.ts' - generic identity and direct-capability guards.
- 'tests/integration/api-source-reader-external-novelcool.test.ts' - pending descriptor and exact lifecycle assertions.
- 'tests/regression/web-source-reader-features.test.ts' - update descriptors and request/gating assertions.
- 'tests/e2e/source-reader-external-novelcool.spec.ts' - verify disabled-before-approval and enabled-after-approval.
- Existing descriptor fixtures under 'tests/e2e', 'tests/regression', and 'tests/fixtures/source-reader' - add 'latestVersion'.
- 'tests/regression/project-command-graph.test.ts', 'project-test-command.test.ts', 'project-clean-command.test.ts', and 'project-unified-build.test.ts' - assert generic command behavior.
- 'tests/regression/project-docs-check.test.ts' - lock the published version and activation contract.
- 'docs/SOURCE_READER.md' - document exact-version approval and provider-neutral orchestration.

---

### Task 1: Add Manifest-Driven Plugin Workspace Discovery

**Files:**
- Create: 'scripts/cli/lib/source-plugin-workspaces.mjs'
- Test: 'tests/regression/source-plugin-workspace-discovery.test.ts'

**Interfaces:**

~~~js
export async function discoverSourcePluginWorkspaces(root): Promise<Array<{
  id: string,
  version: string,
  workspaceName: string,
  workspaceRoot: string,
  packageJsonPath: string,
  manifestPath: string,
  tsconfigPath: string | undefined,
  distPath: string,
  packageJson: object,
  manifest: object,
}>>
~~~

The function scans only direct 'plugins/*' directories, sorts by manifest ID, and validates that
each directory has matching package/manifest identity, a semver version, and a unique 'id@version'.
It returns an empty array when 'plugins' does not exist or has no valid workspace directories.

- [ ] **Step 1: Write failing discovery tests.** Create temporary roots covering zero plugins, one valid plugin, two out-of-order plugins, a package/manifest version mismatch, a missing manifest, and duplicate IDs.

~~~ts
test('discovers plugins in manifest order and returns an empty list when none exist', async () => {
  const root = await fixtureRoot({
    'plugins/zeta/package.json': JSON.stringify({ name: '@test/zeta', version: '1.0.0', scripts: { test: 'node test.js' } }),
    'plugins/zeta/manifest.json': JSON.stringify({ id: 'zeta', version: '1.0.0' }),
    'plugins/alpha/package.json': JSON.stringify({ name: '@test/alpha', version: '1.0.0' }),
    'plugins/alpha/manifest.json': JSON.stringify({ id: 'alpha', version: '1.0.0' })
  });
  const { discoverSourcePluginWorkspaces } = await import('../../scripts/cli/lib/source-plugin-workspaces.mjs');
  assert.deepEqual((await discoverSourcePluginWorkspaces(root)).map((item) => item.id), ['alpha', 'zeta']);
});
~~~

- [ ] **Step 2: Run the focused test and verify the expected RED failure.**

Run: 'node --import tsx --test tests/regression/source-plugin-workspace-discovery.test.ts'

Expected: FAIL because 'source-plugin-workspaces.mjs' does not exist.

- [ ] **Step 3: Implement discovery and validation.** Read 'plugins' with 'readdir({ withFileTypes: true })', parse both JSON files, validate 'manifest.id', 'manifest.version', package name, and duplicate identities, then return normalized absolute paths and scripts.

- [ ] **Step 4: Run the focused test and verify GREEN.**

Run: 'node --import tsx --test tests/regression/source-plugin-workspace-discovery.test.ts'

Expected: all discovery cases pass, including deterministic errors for malformed and duplicate workspaces.

- [ ] **Step 5: Commit the discovery unit.**

~~~bash
git add scripts/cli/lib/source-plugin-workspaces.mjs tests/regression/source-plugin-workspace-discovery.test.ts
git commit -m "build: discover source plugin workspaces generically"
~~~

### Task 2: Replace Concrete Plugin Names in Build, Check, Test, and Clean

**Files:**
- Modify: 'scripts/cli/commands/build.mjs'
- Modify: 'scripts/cli/commands/check.mjs'
- Modify: 'scripts/cli/commands/test.mjs'
- Modify: 'scripts/cli/commands/clean.mjs'
- Test: 'tests/regression/project-command-graph.test.ts'
- Test: 'tests/regression/project-test-command.test.ts'
- Test: 'tests/regression/project-clean-command.test.ts'
- Test: 'tests/integration/project-unified-build.test.ts'
- Test: 'tests/regression/project-source-plugin-package.test.ts'

**Interfaces:**

Each command imports 'discoverSourcePluginWorkspaces' and accepts an optional discovery function
in its exported helper options so tests can inject temporary workspaces without modifying the real
repository. The production defaults always use the repository root.

- 'defaultPackageFirstPartyPlugins({ root, stage, outputDirectory, discover = discoverSourcePluginWorkspaces })'
- 'defaultRunPlugins({ signal, discover = discoverSourcePluginWorkspaces })'
- 'cleanGeneratedArtifacts({ projectRoot, discover = discoverSourcePluginWorkspaces })'

- [ ] **Step 1: Write failing command-graph assertions.** Assert that the command implementation files do not contain 'novelcool', that a temporary workspace is packaged/tested/cleaned through discovery, and that an empty 'plugins' directory does not fail.

~~~ts
test('command implementations do not name a concrete plugin', async () => {
  const sources = await Promise.all([
    readFile('scripts/cli/commands/build.mjs', 'utf8'),
    readFile('scripts/cli/commands/check.mjs', 'utf8'),
    readFile('scripts/cli/commands/test.mjs', 'utf8'),
    readFile('scripts/cli/commands/clean.mjs', 'utf8')
  ]);
  for (const source of sources) assert.doesNotMatch(source, /novelcool/i);
});
~~~

- [ ] **Step 2: Run the focused command tests and verify RED.**

Run: 'node --import tsx --test tests/regression/project-command-graph.test.ts tests/regression/project-test-command.test.ts tests/regression/project-clean-command.test.ts'

Expected: FAIL because the current commands contain the hard-coded workspace/path and do not accept discovery injection.

- [ ] **Step 3: Update full build packaging.** Iterate discovered workspaces and call 'packageFirstPartySourcePlugin' once per workspace, preserving the existing verifier, atomic staging, deterministic artifact naming, and zero-plugin success.

- [ ] **Step 4: Update plugin test execution.** For each discovered workspace with a 'test' script, run 'npm run test --workspace <workspaceName>' sequentially; print a no-workspaces message and return when the list is empty.

- [ ] **Step 5: Update type checking and clean.** Add each discovered 'tsconfig.json' to the type group and each discovered 'distPath' to generated cleanup targets. Keep existing path-safety checks and tsbuildinfo scanning.

- [ ] **Step 6: Update graph/build tests and run GREEN.** Replace hard-coded artifact assumptions in generic command tests with manifest-derived expectations while retaining one real NovelCool package assertion in the package-specific integration test.

Run: 'node --import tsx --test tests/regression/project-command-graph.test.ts tests/regression/project-test-command.test.ts tests/regression/project-clean-command.test.ts tests/integration/project-unified-build.test.ts tests/regression/project-source-plugin-package.test.ts'

Expected: all focused command and packaging tests pass.

- [ ] **Step 7: Commit the generic command graph.**

~~~bash
git add scripts/cli/commands/build.mjs scripts/cli/commands/check.mjs scripts/cli/commands/test.mjs scripts/cli/commands/clean.mjs tests/regression/project-command-graph.test.ts tests/regression/project-test-command.test.ts tests/regression/project-clean-command.test.ts tests/integration/project-unified-build.test.ts tests/regression/project-source-plugin-package.test.ts
git commit -m "build: make plugin command orchestration generic"
~~~

### Task 3: Enforce Provider-Neutral Host Boundaries

**Files:**
- Modify: 'scripts/cli/lib/repository-boundaries.mjs'
- Modify: 'apps/api/src/modules/ingestion/application/services/chapter-fetch.service.ts'
- Test: 'tests/regression/novelcool-external-boundary.test.ts'

**Interfaces:**

Extend 'checkFirstPartyPluginBoundaries(root)' to derive forbidden host tokens from discovered
manifests. Scan only production source under 'apps/*/src' and 'packages/*/src' for plugin IDs and
declared domains. Scan plugin production source for imports that are not relative or the exact
public SDK specifier, plus direct 'node:' imports and 'fetch(' usage.

- [ ] **Step 1: Add failing boundary tests.** Add temporary fixtures containing a manifest with ID 'fixture-source' and host 'fixture.test', a host source reference, a plugin 'node:fs' import, and a plugin 'fetch()' call. Assert each violation has a stable error message. Add a regression assertion that 'chapter-fetch.service.ts' contains no provider hostname.

- [ ] **Step 2: Run the focused boundary tests and verify RED.**

Run: 'node --import tsx --test tests/regression/novelcool-external-boundary.test.ts'

Expected: FAIL because only built-in path/import boundaries are currently checked and ingestion still contains 'novelcool.com'.

- [ ] **Step 3: Implement manifest-derived checks.** Reuse the discovery utility, normalize IDs/domains case-insensitively, skip 'dist', 'node_modules', tests, fixtures, and docs, and report the relative file path plus violation category.

- [ ] **Step 4: Remove the host-specific ingestion filter.** Delete only the 'novelcool.com' line from 'sanitizeIngestionChapterText'; retain generic URL, title, download, chapter-heading, and promotional-footer filters.

- [ ] **Step 5: Run focused boundary and ingestion tests and verify GREEN.**

Run: 'node --import tsx --test tests/regression/novelcool-external-boundary.test.ts tests/regression/api-ingestion-domain.test.ts tests/regression/api-ingestion-http-services.test.ts'

Expected: all boundary and ingestion tests pass, and the host source has no NovelCool token.

- [ ] **Step 6: Commit the host boundary hardening.**

~~~bash
git add scripts/cli/lib/repository-boundaries.mjs apps/api/src/modules/ingestion/application/services/chapter-fetch.service.ts tests/regression/novelcool-external-boundary.test.ts
git commit -m "refactor: enforce provider-neutral source boundaries"
~~~

### Task 4: Publish an Exact Latest Version from the Backend

**Files:**
- Modify: 'packages/shared/src/index.ts'
- Modify: 'apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts'
- Modify: 'apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts'
- Test: 'tests/regression/source-plugin-version-contract.test.ts'
- Test: 'tests/integration/api-source-reader-external-novelcool.test.ts'

**Interfaces:**

Add 'latestVersion: string' to 'SourceReaderPluginDescriptor' and to the 'listInstalled()' port
return type. 'SqlitePluginStore.listInstalled()' must select the newest version independently from
'active_version', join its manifest, and compute 'permissionsPending' for that exact version.

- [ ] **Step 1: Write the failing persistence contract.** Seed an inactive 'fixture-source@2.0.0', requested permission 'pending', and assert:

~~~ts
const [descriptor] = await store.listInstalled();
assert.equal(descriptor.latestVersion, '2.0.0');
assert.equal('activeVersion' in descriptor, false);
assert.equal(descriptor.permissionsPending, true);
~~~

Also seed an active '1.0.0' plus newer '2.0.0' and assert 'activeVersion === 1.0.0' while 'latestVersion === 2.0.0'.

- [ ] **Step 2: Run the focused persistence test and verify RED.**

Run: 'node --import tsx --test tests/regression/source-plugin-version-contract.test.ts tests/integration/api-source-reader-external-novelcool.test.ts'

Expected: FAIL because 'listInstalled()' omits 'latestVersion' and chooses the active version for its descriptor join.

- [ ] **Step 3: Update shared and port types.** Make 'latestVersion' required and keep 'activeVersion' optional. Update every typed descriptor fixture to include a latest version.

- [ ] **Step 4: Rewrite the SQLite descriptor query.** Preserve the aggregate plugin state and active-version join, add a correlated latest-version selection ordered by 'installed_at DESC, version DESC', join the latest manifest, and use the same selected version in the permissions 'EXISTS' clause.

- [ ] **Step 5: Add exact lifecycle assertions.** In the NovelCool integration, list immediately after install, assert 'latestVersion=2.0.0', no active version, pending permissions, then approve, enable, and assert both 'latestVersion' and 'activeVersion' equal '2.0.0'.

- [ ] **Step 6: Run backend focused tests and verify GREEN.**

Run: 'node --import tsx --test tests/regression/source-plugin-version-contract.test.ts tests/integration/api-source-reader-external-novelcool.test.ts'

Expected: pending, approval, activation, invocation, and disable assertions all pass.

- [ ] **Step 7: Commit the backend contract.**

~~~bash
git add packages/shared/src/index.ts apps/api/src/modules/source-reader/application/ports/plugin-store.port.ts apps/api/src/modules/source-reader/infrastructure/sqlite/sqlite-plugin.store.ts tests/regression/source-plugin-version-contract.test.ts tests/integration/api-source-reader-external-novelcool.test.ts
git commit -m "fix(source-reader): expose exact plugin version for activation"
~~~

### Task 5: Make the Web Approval and Initial Enable Flow Version-Safe

**Files:**
- Modify: 'apps/web/src/entities/source-plugin/api/source-plugin-api.ts'
- Modify: 'apps/web/src/features/manage-source-plugins/model/create-plugin-toggle-action.ts'
- Modify: 'apps/web/src/features/manage-source-plugins/model/use-source-plugin-actions.ts'
- Create: 'apps/web/src/features/manage-source-plugins/model/source-plugin-activation-state.ts'
- Modify: 'apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx'
- Modify: 'apps/web/src/features/manage-source-plugins/i18n/catalog.ts'
- Modify: 'apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx'
- Modify: 'apps/web/src/features/review-source-permissions/ui/ReviewSourcePermissions.tsx'
- Modify: 'apps/web/src/features/review-source-permissions/model/use-review-source-permissions.ts'
- Test: 'tests/regression/web-source-plugin-activation.test.ts'
- Test: 'tests/regression/web-source-reader-features.test.ts'
- Test: all descriptor fixtures found by 'rg -n "trustLevel:|activeVersion:" tests/e2e tests/regression tests/fixtures/source-reader'

**Interfaces:**

'SourcePlugin' requires 'latestVersion'. 'PluginToggleInput.version' becomes required. The pure
'getSourcePluginActivationState(plugin)' helper returns the exact target version plus
'canEnable'/'canActivateLatest' booleans. The toggle hook passes 'plugin.latestVersion', while the
UI disables the off-to-on switch when 'plugin.permissionsPending' is true or 'latestVersion' is
absent. Permission review always receives 'plugin.latestVersion'.

- [ ] **Step 1: Write failing frontend contract tests.** Mock 'GET /api/source-reader/plugins' with an inactive descriptor containing 'latestVersion: 2.0.0', no 'activeVersion', and 'permissionsPending: true'; assert normalization preserves latest version, permission mutation sends the body '{ version: 2.0.0 }', 'getSourcePluginActivationState' returns 'canEnable: false' while pending and 'canEnable: true' after approval, and the switch is disabled until the permission state is refreshed.

- [ ] **Step 2: Run the focused frontend tests and verify RED.**

Run: 'node --import tsx --test tests/regression/web-source-plugin-activation.test.ts tests/regression/web-source-reader-features.test.ts'

Expected: FAIL because the current normalizer has no 'latestVersion', details passes 'activeVersion' (undefined), and the switch does not gate pending permissions.

- [ ] **Step 3: Update the entity contract, normalizer, and pure activation helper.** Require 'latestVersion', preserve optional 'activeVersion', and throw the existing invalid-descriptor error when latest version is missing. Implement 'getSourcePluginActivationState(plugin)' with these exact rules: 'targetVersion = plugin.latestVersion'; 'canEnable = !plugin.enabled && !plugin.permissionsPending && Boolean(plugin.latestVersion)'; 'canActivateLatest = Boolean(plugin.enabled && plugin.activeVersion && plugin.activeVersion !== plugin.latestVersion && !plugin.permissionsPending)'. Do not fall back from latest to active.

- [ ] **Step 4: Update permission review and toggle actions.** Pass 'latestVersion' to approve/deny and enable; keep the backend version body unchanged. Preserve optimistic rollback and query invalidation.

- [ ] **Step 5: Gate the switch and add copy.** Use 'getSourcePluginActivationState' to add an approval-required description in English and Vietnamese. Disable only the inactive-to-active path while permissions are pending; keep disable available for an active plugin.

- [ ] **Step 6: Display both version meanings.** Show latest installed version in details and, when present and different, show the active version as the running version. Pass latest version to 'ReviewSourcePermissions'.

- [ ] **Step 7: Update fixtures and run GREEN.** Add 'latestVersion' to every shared descriptor fixture and run:

Run: 'node --import tsx --test tests/regression/web-source-plugin-activation.test.ts tests/regression/web-source-reader-features.test.ts tests/regression/web-source-reader-entities.test.ts'

Expected: all frontend contract and architecture tests pass.

- [ ] **Step 8: Commit the initial approval/enable flow.**

~~~bash
git add apps/web/src/entities/source-plugin/api/source-plugin-api.ts apps/web/src/features/manage-source-plugins apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx apps/web/src/features/review-source-permissions tests/regression/web-source-plugin-activation.test.ts tests/regression/web-source-reader-features.test.ts tests/regression/web-source-reader-entities.test.ts tests/e2e tests/fixtures/source-reader
git commit -m "fix(web): require permission approval before plugin enable"
~~~

### Task 6: Add an Explicit Activate-Latest Action for Upgrades

**Files:**
- Modify: 'apps/web/src/features/manage-source-plugins/api/manage-source-plugins.ts'
- Modify: 'apps/web/src/features/manage-source-plugins/model/use-source-plugin-actions.ts'
- Modify: 'apps/web/src/features/manage-source-plugins/ui/SourcePluginActions.tsx'
- Modify: 'apps/web/src/features/manage-source-plugins/i18n/catalog.ts'
- Modify: 'apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx'
- Test: 'tests/regression/web-source-plugin-activation.test.ts'

**Interfaces:**

Add 'useActivateLatestSourcePlugin()' with mutation input '{ pluginId, version }'. It calls the
existing 'enableSourcePlugin(pluginId, version)' endpoint, invalidates all source-plugin queries,
and displays the existing public error description on failure.

- [ ] **Step 1: Write the failing upgrade-action test.** Seed an enabled descriptor with
  'activeVersion=1.0.0', 'latestVersion=2.0.0', and 'permissionsPending=false'; assert the action
  sends version '2.0.0'. Seed the same descriptor with pending permissions and assert the action is
  disabled by the UI.

- [ ] **Step 2: Run the focused test and verify RED.**

Run: 'node --import tsx --test tests/regression/web-source-plugin-activation.test.ts'

Expected: FAIL because no latest-version action or control exists.

- [ ] **Step 3: Implement the action and control.** Render an 'Activate latest' button only when
  'getSourcePluginActivationState(plugin).canActivateLatest' is true; disable it while permissions
  are pending; reuse the exact-version endpoint and invalidation adapter.

- [ ] **Step 4: Add English/Vietnamese labels and run GREEN.**

Run: 'node --import tsx --test tests/regression/web-source-plugin-activation.test.ts tests/regression/web-source-reader-features.test.ts'

Expected: initial activation, upgrade activation, pending gate, rollback, and query invalidation pass.

- [ ] **Step 5: Commit the upgrade action.**

~~~bash
git add apps/web/src/features/manage-source-plugins apps/web/src/widgets/source-plugin-details/ui/SourcePluginDetails.tsx tests/regression/web-source-plugin-activation.test.ts tests/regression/web-source-reader-features.test.ts
git commit -m "feat(web): expose explicit latest plugin activation"
~~~

### Task 7: Lock the Real External Lifecycle and Documentation

**Files:**
- Modify: 'tests/e2e/source-reader-external-novelcool.spec.ts'
- Modify: 'tests/integration/api-source-reader-external-novelcool.test.ts'
- Modify: 'docs/SOURCE_READER.md'
- Modify: 'tests/regression/project-docs-check.test.ts' - assert the published exact-version lifecycle and provider-neutral orchestration wording.

- [ ] **Step 1: Write the failing E2E assertions.** After installation, assert the details page
  shows '2.0.0', the Enable switch is disabled while permissions are pending, Approve succeeds,
  the switch becomes enabled after query refresh, and activation sends the body '{ version: 2.0.0 }'.

- [ ] **Step 2: Run the focused E2E and verify RED.**

Run: 'node node_modules/@playwright/test/cli.js test tests/e2e/source-reader-external-novelcool.spec.ts --grep "installs, approves and enables"'

Expected: FAIL because the mock descriptor currently supplies an 'activeVersion' before activation
and the UI does not enforce the approval gate.

- [ ] **Step 3: Update the E2E mock contract.** Return 'latestVersion' for the installed descriptor,
  omit 'activeVersion' until 'enabled=true', and assert the mocked enable route receives an approved
  exact version.

- [ ] **Step 4: Update Source Reader documentation.** Document 'latestVersion' versus
  'activeVersion', the manual Install -> Approve -> Enable sequence, and the fact that command
  orchestration discovers plugin workspaces without provider-specific code. Extend
  'project-docs-check.test.ts' to assert all four phrases so the published contract cannot regress.

- [ ] **Step 5: Run the focused lifecycle tests.**

Run: 'node --import tsx --test tests/integration/api-source-reader-external-novelcool.test.ts tests/regression/novelcool-external-boundary.test.ts'

Expected: production install/approval/activation/disable and boundary assertions pass.

- [ ] **Step 6: Commit lifecycle documentation and E2E coverage.**

~~~bash
git add tests/e2e/source-reader-external-novelcool.spec.ts tests/integration/api-source-reader-external-novelcool.test.ts docs/SOURCE_READER.md tests/regression/project-docs-check.test.ts
git commit -m "test: lock explicit external plugin activation lifecycle"
~~~

### Task 8: Full Verification and Handoff

**Files:**
- No new production files. Review the complete diff and generated artifacts.

- [ ] **Step 1: Run static checks by group.**

~~~bash
node scripts/cli.mjs check --group format
node scripts/cli.mjs check --group types
node scripts/cli.mjs check --group architecture
node scripts/cli.mjs check --group commands
node scripts/cli.mjs check --group lockfile
node scripts/cli.mjs check --group docs
~~~

Expected: every group exits 0 with no hard-coded provider boundary violation.

- [ ] **Step 2: Run the full core suite.**

Run: 'npm test'

Expected: reader-engine, plugin, contract, regression, and integration suites pass with zero failures.

- [ ] **Step 3: Run the full build.**

Run: 'npm run build'

Expected: build succeeds, every discovered plugin artifact is verifier-approved, and targeted API/web builds do not mutate plugin artifacts.

- [ ] **Step 4: Run the browser suite when Chromium capability is available.**

Run: 'npm test -- --suite e2e'

Expected: external install/approve/enable flow passes with the switch disabled before approval and enabled after approval.

- [ ] **Step 5: Inspect final repository state.**

~~~bash
git diff --check
git status --short --branch
git log --oneline -8
~~~

Expected: only intentional commits and no generated or untracked source changes remain.

- [ ] **Step 6: Report verification evidence and integration options.** Do not push unless explicitly requested; offer local merge, PR, or keep-branch options after all checks are green.

## Plan Self-Review Checklist

- Spec coverage: Tasks 1-3 cover generic discovery and host/plugin boundaries; Tasks 4-6 cover the latest/active contract and both initial and upgrade activation; Task 7 covers production lifecycle and documentation; Task 8 covers all verification commands.
- Type consistency: 'latestVersion' is introduced in Task 4, consumed by the web in Task 5, and reused by the upgrade action in Task 6. 'activeVersion' remains optional throughout.
- Testability: 'getSourcePluginActivationState' is a pure helper with direct regression assertions for pending approval, initial activation, and latest-version upgrades.
- Security consistency: no task combines approval with activation or makes the server infer a version.
- Zero-plugin behavior: discovery and all four command consumers explicitly handle an empty list.
- No placeholders: every task names exact files, test commands, expected RED/GREEN evidence, and commit boundaries.
