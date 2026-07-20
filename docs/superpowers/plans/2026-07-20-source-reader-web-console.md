# Source Reader Web Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Replace the minimal Sources page with a complete, typed Source Reader administration and inspection console covering all 33 HTTP routes that are meaningful to the browser.

**Architecture:** Implement vertical FSD slices with dependency direction `pages → widgets → features → entities → shared`. Shared contracts are defined in `@novel-tool/shared`; entity slices own query APIs and display models; feature slices own mutations and forms; widgets coordinate features; pages own only routing and composition.

**Tech Stack:** TypeScript 5.5, React 18, React Router 7, TanStack React Query 5, Zod 3, existing Novel Tool shared UI/theme/motion primitives, Node test runner, Playwright.

## Global Constraints

- Preserve `pages → widgets → features → entities → shared`; no cross-feature imports.
- Pages must not import Source Reader API clients directly.
- All application TSX imports UI primitives from `@/shared/ui`.
- Do not add arbitrary color, radius, shadow, typography, opacity, duration, or easing values.
- Motion uses existing shared primitives and CSS variables only.
- Credential and proxy secrets are write-only and must not enter React Query data, route state, diagnostics, logs, toasts, or persisted browser storage.
- Keep `/sources`, `/sources/new`, and `/sources/:pluginId` compatible.
- Keep `streamChapterList` backend-only.
- Support English and Vietnamese copy for every new user-facing string.
- Use TDD: add each regression/contract test first, verify RED, implement the smallest change, verify GREEN.

---

## File Map

### Shared contracts and transport

- Modify `packages/shared/src/index.ts`: canonical Source Reader admin and reader request/response types.
- Modify `apps/api/src/modules/source-reader/public/source-reader.api.ts`: replace browser-facing `unknown` management outputs with shared contracts.
- Modify `apps/api/src/modules/source-reader/presentation/controllers/source-reader-admin.controller.ts`: retain stable response shapes only.
- Modify `apps/web/src/shared/api/http.ts`: add `httpFormData` without forcing JSON content type.
- Modify `apps/web/src/shared/api/queryKeys.ts`: hierarchical Source Reader key family.

### Entity slices

- Create `apps/web/src/entities/source-plugin/{api,model,ui,index.ts}`.
- Create `apps/web/src/entities/source-credential/{api,model,ui,index.ts}`.
- Create `apps/web/src/entities/source-network-profile/{api,model,ui,index.ts}`.
- Create `apps/web/src/entities/source-auth-challenge/{api,model,ui,index.ts}`.
- Create `apps/web/src/entities/source-reader-result/{api,model,ui,index.ts}`.

### Feature slices

- Create `apps/web/src/features/install-source-plugin/`.
- Refactor `apps/web/src/features/manage-source-plugins/` into mutation-only plugin actions.
- Create `apps/web/src/features/review-source-permissions/`.
- Create `apps/web/src/features/test-source-plugin/`.
- Create `apps/web/src/features/manage-source-credential/`.
- Create `apps/web/src/features/authenticate-source-credential/`.
- Create `apps/web/src/features/manage-source-network-profile/`.
- Create `apps/web/src/features/resolve-source-auth-challenge/`.
- Create `apps/web/src/features/inspect-source-url/`.

### Widgets and pages

- Create `apps/web/src/widgets/source-reader-overview/`.
- Create `apps/web/src/widgets/source-plugin-details/`.
- Create `apps/web/src/widgets/source-credentials-panel/`.
- Create `apps/web/src/widgets/source-network-profiles-panel/`.
- Create `apps/web/src/widgets/source-auth-challenges-panel/`.
- Create `apps/web/src/widgets/source-inspector/`.
- Replace `apps/web/src/pages/sources/model/useSourcesPage.ts` with route-section state only.
- Replace `apps/web/src/pages/sources/ui/SourcesPage.tsx` with console composition.
- Replace `apps/web/src/pages/sources/ui/SourcePluginPage.tsx` with install/detail widget composition.
- Modify `apps/web/src/app/router/AppRouter.tsx` and `routePreload.ts` only if route composition requires a dedicated install/detail module.

### Localization and verification

- Modify `apps/web/src/shared/i18n/locales/en.ts`.
- Modify `apps/web/src/shared/i18n/locales/vi.ts`.
- Create `tests/regression/source-reader-web-console-contract.test.ts`.
- Create `tests/regression/source-reader-web-console-fsd.test.ts`.
- Modify `tests/e2e/source-reader-sources-page.spec.ts`.
- Modify `scripts/check-web-contracts.mjs` if route coverage needs a stable automated assertion.

---

### Task 1: Canonical shared browser contracts and multipart transport

**Files:**
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/modules/source-reader/public/source-reader.api.ts`
- Modify: `apps/web/src/shared/api/http.ts`
- Modify: `apps/web/src/shared/api/queryKeys.ts`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceReaderCredentialMetadata`, `SourceReaderNetworkProfileMetadata`, `SourceReaderAuthChallenge`, `SourceReaderPluginPermission`, `SourceReaderPluginInstallResult`, reader request/result types, and `httpFormData<T>()`.
- Later tasks consume only these shared types and query key functions.

- [x] **Step 1: Write the failing contract test**

```ts
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

test('shared exports complete Source Reader browser contracts', async () => {
  const shared = await readFile('packages/shared/src/index.ts', 'utf8');
  for (const name of [
    'SourceReaderCredentialMetadata',
    'SourceReaderNetworkProfileMetadata',
    'SourceReaderAuthChallenge',
    'SourceReaderPluginPermission',
    'SourceReaderInspectOperation'
  ]) assert.match(shared, new RegExp(`export (?:type|interface) ${name}`));

  const http = await readFile('apps/web/src/shared/api/http.ts', 'utf8');
  assert.match(http, /export async function httpFormData/);
  assert.doesNotMatch(http, /httpFormData[\s\S]*Content-Type': 'application\/json'/);
});
```

- [x] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts`

Expected: FAIL because contracts and `httpFormData` do not exist.

- [x] **Step 3: Implement canonical contracts**

Add exact browser-safe types to `packages/shared/src/index.ts`, including:

```ts
export type SourceReaderOwnerType = 'system' | 'user';
export type SourceReaderCredentialStrategy =
  | 'cookie-import'
  | 'bearer-token'
  | 'basic-auth'
  | 'form-login'
  | 'custom';
export interface SourceReaderCredentialMetadata {
  id: string;
  ownerType: SourceReaderOwnerType;
  ownerId?: string;
  pluginId?: string;
  domain?: string;
  name: string;
  strategy: SourceReaderCredentialStrategy;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export type SourceReaderNetworkRouteType =
  | 'direct'
  | 'http-proxy'
  | 'https-proxy'
  | 'socks-proxy'
  | 'vpn-gateway';
export interface SourceReaderNetworkProfileMetadata {
  id: string;
  ownerType: SourceReaderOwnerType;
  ownerId?: string;
  name: string;
  routeType: SourceReaderNetworkRouteType;
  regions: string[];
  tags: string[];
  healthStatus: 'unknown' | 'healthy' | 'degraded' | 'offline';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface SourceReaderAuthChallenge {
  id: string;
  pluginId: string;
  credentialProfileId?: string;
  networkProfileId?: string;
  ownerId?: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  status: 'pending' | 'completed' | 'expired' | 'cancelled' | 'failed';
  expiresAt: string;
}
```

Add all request/response types needed by the six reader routes and plugin management routes. Change `SourceReaderManagementApi` output types to these contracts.

Implement multipart transport:

```ts
export async function httpFormData<T>(path: string, body: FormData, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, method: init?.method ?? 'POST', body });
  return readApiSuccess<T>(response);
}
```

Implement hierarchical keys:

```ts
sourceReader: {
  all: ['source-reader'] as const,
  plugins: () => ['source-reader', 'plugins'] as const,
  plugin: (id: string) => ['source-reader', 'plugins', id] as const,
  pluginHealth: (id: string) => ['source-reader', 'plugins', id, 'health'] as const,
  pluginPermissions: (id: string) => ['source-reader', 'plugins', id, 'permissions'] as const,
  credentials: () => ['source-reader', 'credentials'] as const,
  networkProfiles: () => ['source-reader', 'network-profiles'] as const,
  challenges: () => ['source-reader', 'auth-challenges'] as const,
  challenge: (id: string) => ['source-reader', 'auth-challenges', id] as const
}
```

- [x] **Step 4: Run GREEN and type checks**

Run:

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check -w @novel-tool/shared
npm run check -w @novel-tool/api
npm run check -w @novel-tool/web
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/shared/src/index.ts apps/api/src/modules/source-reader/public/source-reader.api.ts apps/web/src/shared/api/http.ts apps/web/src/shared/api/queryKeys.ts tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: define source reader web contracts"
```

---

### Task 2: Entity query APIs and display models

**Files:**
- Create: `apps/web/src/entities/source-plugin/**`
- Create: `apps/web/src/entities/source-credential/**`
- Create: `apps/web/src/entities/source-network-profile/**`
- Create: `apps/web/src/entities/source-auth-challenge/**`
- Create: `apps/web/src/entities/source-reader-result/**`
- Test: `tests/regression/source-reader-web-console-fsd.test.ts`

**Interfaces:**
- Produces query hooks and entity UI: `useSourcePluginsQuery`, `useSourcePluginQuery`, `useSourceCredentialsQuery`, `useSourceNetworkProfilesQuery`, `useSourceAuthChallengesQuery`, `SourcePluginRow`, `SourceCredentialRow`, `SourceNetworkProfileRow`, `SourceAuthChallengeRow`, and `SourceReaderResultView`.

- [x] **Step 1: Write the failing FSD test**

```ts
for (const slice of [
  'source-plugin',
  'source-credential',
  'source-network-profile',
  'source-auth-challenge',
  'source-reader-result'
]) {
  assert.equal(await exists(`apps/web/src/entities/${slice}/index.ts`), true);
}
```

Also assert that entity files do not import `@/features`, `@/widgets`, or `@/pages`.

- [x] **Step 2: Run RED**

Run: `node --import tsx --test tests/regression/source-reader-web-console-fsd.test.ts`

Expected: FAIL because slices do not exist.

- [x] **Step 3: Implement APIs and models**

Each entity API uses the canonical HTTP envelope and shared contracts. Example:

```ts
export const listSourceCredentials = (signal?: AbortSignal) =>
  http<SourceReaderCredentialMetadata[]>('/api/source-reader/credentials', { signal });

export function useSourceCredentialsQuery() {
  return useQuery({
    queryKey: queryKeys.sourceReader.credentials(),
    queryFn: ({ signal }) => listSourceCredentials(signal)
  });
}
```

Plugin normalization remains in the entity API only until backend descriptors are canonical. Entity UI uses `ListRow`, `Badge`, `Text`, `Chip`, and `Switch` supplied by features as trailing actions.

- [x] **Step 4: Run GREEN and FSD gate**

```bash
node --import tsx --test tests/regression/source-reader-web-console-fsd.test.ts
npm run check:web-arch
npm run check -w @novel-tool/web
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/web/src/entities tests/regression/source-reader-web-console-fsd.test.ts
git commit -m "feat: add source reader entities"
```

---

### Task 3: Plugin overview, install, lifecycle, diagnostics, health, and permissions

**Files:**
- Refactor: `apps/web/src/features/manage-source-plugins/**`
- Create: `apps/web/src/features/install-source-plugin/**`
- Create: `apps/web/src/features/review-source-permissions/**`
- Create: `apps/web/src/features/test-source-plugin/**`
- Create: `apps/web/src/widgets/source-reader-overview/**`
- Create: `apps/web/src/widgets/source-plugin-details/**`
- Replace: `apps/web/src/pages/sources/ui/SourcePluginPage.tsx`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceReaderOverview`, `SourcePluginDetails`, and `InstallSourcePluginForm`.
- Consumes source-plugin entity queries and mutation APIs only.

- [x] **Step 1: Add RED assertions for every plugin endpoint**

Assert web source contains all routes:

```ts
'/source-reader/plugins/install'
'/enable'
'/disable'
'/test'
'/health'
'/permissions'
```

and `DELETE /plugins/:pluginId`.

- [x] **Step 2: Run RED**

Expected: missing install, remove, permissions, diagnostics UI.

- [x] **Step 3: Implement mutation features**

- `install-source-plugin`: one file, 20 MiB validation, `FormData` field `plugin`, clears input after success.
- `manage-source-plugins`: enable/disable optimistic rollback and remove confirmation.
- `test-source-plugin`: runs test and invalidates health, diagnostics, detail, list.
- `review-source-permissions`: approve/deny selected active version and invalidates permissions/detail/list.

Use only existing `Button`, `Switch`, `Field`, `Input`, `ConfirmDialog`, `ErrorBanner`, `InlineNotice`, `Toast`, `Panel`, and `ListRow`.

- [x] **Step 4: Implement widgets and routes**

`SourceReaderOverview` owns search, summary counts, plugin list, and navigation. `SourcePluginDetails` composes identity, diagnostics, health, permissions, lifecycle actions. `/sources/new` renders the install form instead of the unsupported empty state.

- [x] **Step 5: Verify**

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check:web-arch
npm run check:web-contracts
npm run check -w @novel-tool/web
```

- [x] **Step 6: Commit**

```bash
git add apps/web/src/entities/source-plugin apps/web/src/features/install-source-plugin apps/web/src/features/manage-source-plugins apps/web/src/features/review-source-permissions apps/web/src/features/test-source-plugin apps/web/src/widgets/source-reader-overview apps/web/src/widgets/source-plugin-details apps/web/src/pages/sources/ui/SourcePluginPage.tsx tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: complete source plugin console"
```

---

### Task 4: Credential management and authentication

**Files:**
- Create: `apps/web/src/features/manage-source-credential/**`
- Create: `apps/web/src/features/authenticate-source-credential/**`
- Create: `apps/web/src/widgets/source-credentials-panel/**`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceCredentialsPanel` with create, replace secret, delete, login, logout, and test actions.

- [x] **Step 1: Add RED route assertions**

Assert presence of POST/PATCH/DELETE credential routes and `/login`, `/logout`, `/test`.

- [x] **Step 2: Implement secret adapters**

Use local component state only. Strategies produce:

```ts
cookie-import → { cookie }
bearer-token → { token }
basic-auth → { username, password }
form-login → { username, password, loginUrl? }
custom → Record<string, string>
```

On mutation settle, clear password/token/cookie/custom value state. Never set secret payload in React Query cache.

- [x] **Step 3: Implement panel**

Use existing `Drawer`/`BottomSheet` for create and replacement forms, `ListRow` for metadata, `ConfirmDialog` for deletion, and network-profile picker populated from entity metadata.

- [x] **Step 4: Verify**

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check:web-arch
npm run check -w @novel-tool/web
```

- [x] **Step 5: Commit**

```bash
git add apps/web/src/features/manage-source-credential apps/web/src/features/authenticate-source-credential apps/web/src/widgets/source-credentials-panel tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: add source credential console"
```

---

### Task 5: Network profile management

**Files:**
- Create: `apps/web/src/features/manage-source-network-profile/**`
- Create: `apps/web/src/widgets/source-network-profiles-panel/**`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceNetworkProfilesPanel` with create, edit, enable/disable, test, and delete.

- [x] **Step 1: Add RED assertions for all five network routes**
- [x] **Step 2: Implement route-specific form serialization**

```ts
direct → undefined config
http-proxy | https-proxy | socks-proxy → { url, username?, password? }
```

Persisted `vpn-gateway` is read-only and may only be deleted.

- [x] **Step 3: Implement panel and safe invalidation**

Boolean enable/disable may be optimistic with rollback; all other actions wait for server confirmation.

- [x] **Step 4: Verify and commit**

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check:web-arch
npm run check -w @novel-tool/web
git add apps/web/src/features/manage-source-network-profile apps/web/src/widgets/source-network-profiles-panel tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: add source network console"
```

---

### Task 6: Authentication challenge handling

**Files:**
- Create: `apps/web/src/features/resolve-source-auth-challenge/**`
- Create: `apps/web/src/widgets/source-auth-challenges-panel/**`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceAuthChallengesPanel` and mutation forms for OTP, approval, browser interaction, and cancellation.

- [x] **Step 1: Add RED assertions for list/detail/respond/cancel routes**
- [x] **Step 2: Implement bounded polling**

```ts
refetchInterval: visible && pendingCount > 0 ? 5_000 : false
```

Do not announce a per-second countdown. Use formatted expiry and restrained status text.

- [x] **Step 3: Implement challenge-specific actions**

- OTP: `{ type: 'otp', code }`
- Approval: `{ type: 'approval', approved }`
- Browser interaction: `{ type: 'browser-interaction', completed }`
- Captcha: display manual/external completion notice and cancellation only.

- [x] **Step 4: Verify and commit**

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check:web-arch
npm run check -w @novel-tool/web
git add apps/web/src/features/resolve-source-auth-challenge apps/web/src/widgets/source-auth-challenges-panel tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: add source authentication challenges"
```

---

### Task 7: Source Inspector for all six reader operations

**Files:**
- Create: `apps/web/src/features/inspect-source-url/**`
- Create: `apps/web/src/widgets/source-inspector/**`
- Test: `tests/regression/source-reader-web-console-contract.test.ts`

**Interfaces:**
- Produces `SourceInspector` and six typed mutation clients.

- [x] **Step 1: Add RED assertions for all six reader routes**

```ts
identify
metadata
chapter-list
chapter-content
search
latest-updates
```

- [x] **Step 2: Implement typed operation clients**

Inspector results remain mutation state and local widget state; they are never stored in persisted query keys.

- [x] **Step 3: Implement request controls**

Common controls: URL, credential profile, network profile, `freshOnly`, timeout 1–120000. Operation controls add query/cursor/limit. Do not expose plugin ID or runtime mode.

- [x] **Step 4: Implement results**

Compose `SourceReaderResultView` for normalized data, provenance, warnings, and advanced redacted JSON. Paginated operations retain opaque cursor only in active widget memory.

- [x] **Step 5: Verify and commit**

```bash
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts
npm run check:web-arch
npm run check:web-contracts
npm run check -w @novel-tool/web
git add apps/web/src/features/inspect-source-url apps/web/src/widgets/source-inspector tests/regression/source-reader-web-console-contract.test.ts
git commit -m "feat: add source reader inspector"
```

---

### Task 8: Console shell, route state, responsive composition, and localization

**Files:**
- Replace: `apps/web/src/pages/sources/model/useSourcesPage.ts`
- Replace: `apps/web/src/pages/sources/ui/SourcesPage.tsx`
- Modify: `apps/web/src/pages/sources/ui/SourcePluginPage.tsx`
- Modify: `apps/web/src/shared/i18n/locales/en.ts`
- Modify: `apps/web/src/shared/i18n/locales/vi.ts`
- Modify: `apps/web/src/app/router/AppRouter.tsx`
- Modify: `apps/web/src/app/router/routePreload.ts`
- Test: `tests/regression/source-reader-web-console-fsd.test.ts`

**Interfaces:**
- Produces URL-authoritative section state for `plugins`, `credentials`, `network`, `challenges`, and `inspector`.

- [x] **Step 1: Write RED tests for page purity and section names**

Assert page sources import widgets but do not import `@/shared/api` or entity API modules. Assert both locales contain every section key.

- [x] **Step 2: Implement section route state**

```ts
export type SourcesSection = 'plugins' | 'credentials' | 'network' | 'challenges' | 'inspector';
```

Invalid section values replace with `plugins`. Navigation uses `SegmentedControl`, URL search params, and existing route behavior.

- [x] **Step 3: Compose widgets responsively**

Use `Page`, `PageHeader`, `Section`, `Panel`, `ResponsiveSplit`, `Stack`, and existing overlays. No new custom motion or visual tokens.

- [x] **Step 4: Add complete EN/VI copy**

All labels, errors, confirmations, empty states, statuses, and form hints receive matching keys in both locale files.

- [x] **Step 5: Verify and commit**

```bash
node --import tsx --test tests/regression/source-reader-web-console-fsd.test.ts
npm run check:web-arch
npm run check:web-contracts
npm run check -w @novel-tool/web
git add apps/web/src/pages/sources apps/web/src/shared/i18n/locales apps/web/src/app/router tests/regression/source-reader-web-console-fsd.test.ts
git commit -m "feat: compose source reader console"
```

---

### Task 9: E2E coverage, cleanup, and final gates

**Files:**
- Modify: `tests/e2e/source-reader-sources-page.spec.ts`
- Modify: `scripts/check-web-contracts.mjs`
- Delete: obsolete page-owned Source Reader cards/models replaced by entity/widgets.
- Modify: `docs/SOURCE_READER.md`

**Interfaces:**
- Final deliverable has intentional coverage for all browser-relevant routes and no legacy page-owned API logic.

- [x] **Step 1: Expand E2E route fixtures**

Cover navigation between all five sections, plugin detail/install, credential form secret clearing, network profile actions, challenge response, and Inspector operation rendering.

- [x] **Step 2: Extend static contract gate**

Assert every Source Reader HTTP route is either referenced by web code or explicitly classified backend-only (`streamChapterList` is not an HTTP route).

- [x] **Step 3: Remove obsolete files and run format**

```bash
npm run format
```

- [x] **Step 4: Run full verification**

```bash
npm run check:lockfile
npm run check
node --import tsx --test tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-console-fsd.test.ts
npm run test:regression
npm run test:integration
npm run build
```

Run Playwright Source Reader E2E when Chromium can reach localhost:

```bash
npx playwright test tests/e2e/source-reader-sources-page.spec.ts
```

Expected: all deterministic gates pass; if Chromium is policy-blocked, capture the exact pre-application navigation error without claiming E2E success.

- [x] **Step 5: Commit**

```bash
git add apps/web packages/shared apps/api tests scripts docs/SOURCE_READER.md
git commit -m "test: verify source reader web console"
```

---

## Self-Review

- **Spec coverage:** Tasks 1–9 cover shared contracts, every plugin route, every credential route, every network route, every challenge route, all six reader routes, route-compatible page composition, secret safety, mobile/shared UI use, EN/VI copy, FSD gates, contracts, build, regression, integration, and conditional E2E.
- **Placeholder scan:** No TBD, TODO, deferred implementation, or undefined interface remains.
- **Type consistency:** All slices consume the `SourceReader*` contracts defined in Task 1; query keys use `queryKeys.sourceReader.*`; page sections use one `SourcesSection` union.
- **Scope:** Backend runtime/domain behavior remains unchanged. Only browser contracts and presentation typing are adjusted.
## Execution Verification

- Static gates: `npm run check` passed, including API architecture, crawler platform, frontend FSD, web contracts, Prettier, and TypeScript checks.
- Regression: 400 tests passed across four deterministic shards. The monolithic runner retains a pre-existing open handle in one mixed shard, so the final shard was also verified file-by-file (91/91 passed).
- Integration: 94 passed, 1 conditional Chromium skip, 0 failed.
- Production build: Shared, API, and Web passed.
- Source Reader Playwright specs were authored and executed with system Chromium, but enterprise browser policy blocked localhost before application code with `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no E2E success is claimed.
