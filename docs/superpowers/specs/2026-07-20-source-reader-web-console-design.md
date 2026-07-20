# Source Reader Web Console Design

## 1. Goal

Turn the existing `/sources` plugin overview into a complete **Source Reader administration and inspection console** while preserving the web application's Feature-Sliced Design boundaries, shared design system, theme tokens, motion primitives, accessibility behavior, and mobile-first navigation.

The console exposes every Source Reader capability that is meaningful to an operator or user:

- plugin installation, lifecycle, health, diagnostics, and permission review;
- credential profile administration and authentication actions;
- network profile administration and connectivity testing;
- authentication challenge handling;
- direct source inspection for identify, metadata, chapter list, chapter content, search, and latest updates.

Backend-only runtime concerns remain hidden from the browser. The web console does not expose sandbox internals, cache internals, raw browser handles, session repositories, plugin selection overrides, or unrestricted secret access.

## 2. Design Principles

1. **Feature-Sliced dependency direction:** `pages → widgets → features → entities → shared`.
2. **No cross-feature imports:** coordination between independent actions belongs in a widget; page models are limited to route state.
3. **Page composition only:** pages own routing, tab selection, and high-level layout; they do not own API clients or mutation business logic.
4. **Stable contracts:** Source Reader management and reader responses used by the browser are declared in `@novel-tool/shared`; frontend code does not depend on SQLite records or backend-internal classes.
5. **Shared UI only:** features compose existing `shared/ui` primitives and do not create private buttons, cards, panels, switches, dialogs, tables, loading states, or toasts.
6. **Theme-owned visuals:** no arbitrary colors, shadows, radii, typography sizes, or animation durations in application TSX.
7. **Secret minimization:** submitted secrets never enter query caches, route state, logs, toast descriptions, diagnostics, or persisted browser storage.
8. **Explicit destructive actions:** plugin, credential, and network-profile deletion require confirmation.
9. **Mobile parity:** all management and challenge flows remain usable on narrow Android viewports.
10. **Progressive disclosure:** common state is visible first; raw diagnostics and advanced request options are available without overwhelming the default view.

## 3. Scope

### 3.1 In scope

- Replace the current Sources overview with a five-section Source Reader console.
- Keep existing routes `/sources`, `/sources/new`, and `/sources/:pluginId` compatible.
- Add route-addressable sections for plugins, credentials, network profiles, challenges, and inspector.
- Implement all Source Reader admin HTTP operations currently exposed by the backend.
- Implement all six public reader HTTP operations in an inspector interface.
- Add stable shared TypeScript contracts for browser-facing Source Reader requests and responses.
- Add React Query query keys, API clients, query hooks, mutations, invalidation, optimistic updates where safe, and action feedback.
- Reuse existing English and Vietnamese localization infrastructure.
- Reuse existing shared theme, component tokens, motion, overlay, responsive, focus, and reduced-motion behavior.
- Add regression, architecture, contract, component, and integration coverage.

### 3.2 Out of scope

- Exposing `streamChapterList` to the browser.
- Displaying or editing encrypted session state.
- Displaying stored credential or proxy secrets after creation.
- Allowing clients to select arbitrary plugin IDs, runtime modes, executable paths, proxy URLs outside a saved network profile, or raw cookies on reader requests.
- Editing a plugin manifest or package contents in the browser.
- Solving CAPTCHA automatically.
- Adding websocket infrastructure solely for this console; challenge freshness uses bounded polling and normal query invalidation.
- Refactoring unrelated web pages or backend Source Reader domain behavior.

## 4. Information Architecture and Routing

`/sources` becomes the Source Reader console shell with five addressable sections:

```text
/sources?section=plugins
/sources?section=credentials
/sources?section=network
/sources?section=challenges
/sources?section=inspector
```

The default section is `plugins`. Invalid values fall back to `plugins` without throwing.

Existing routes remain meaningful:

```text
/sources/new                  → install-plugin flow
/sources/:pluginId            → plugin detail
```

Optional nested detail state may use query parameters or child paths when needed, but the browser Back action must always restore the prior console section and list state.

The section switch uses the existing `SegmentedControl` on compact layouts and route-aware section navigation on larger layouts. URL state is authoritative so deep links, refresh, route preloading, and browser navigation work consistently.

## 5. FSD Structure

The implementation follows this target structure. Exact filenames may vary only when an existing slice already provides the same responsibility.

```text
apps/web/src/
├── entities/
│   ├── source-plugin/
│   │   ├── api/
│   │   ├── model/
│   │   └── ui/
│   ├── source-credential/
│   │   ├── api/
│   │   ├── model/
│   │   └── ui/
│   ├── source-network-profile/
│   │   ├── api/
│   │   ├── model/
│   │   └── ui/
│   ├── source-auth-challenge/
│   │   ├── api/
│   │   ├── model/
│   │   └── ui/
│   └── source-reader-result/
│       ├── model/
│       └── ui/
├── features/
│   ├── install-source-plugin/
│   ├── manage-source-plugin/
│   ├── review-source-permissions/
│   ├── test-source-plugin/
│   ├── manage-source-credential/
│   ├── authenticate-source-credential/
│   ├── manage-source-network-profile/
│   ├── resolve-source-auth-challenge/
│   └── inspect-source-url/
├── widgets/
│   ├── source-reader-overview/
│   ├── source-plugin-details/
│   ├── source-credentials-panel/
│   ├── source-network-profiles-panel/
│   ├── source-auth-challenges-panel/
│   └── source-inspector/
└── pages/
    └── sources/
        ├── model/
        └── ui/
```

### 5.1 Entity responsibilities

- `source-plugin`: descriptors, diagnostics, health, permissions, display helpers, and entity rows/cards.
- `source-credential`: credential metadata only; secret payload types are request-only and never retained as entity state.
- `source-network-profile`: profile metadata, route type labels, health state, and entity rows.
- `source-auth-challenge`: challenge metadata, expiry helpers, and challenge display.
- `source-reader-result`: normalized reader result/provenance/warning display shared by inspector operations.

Entity slices may import only `shared`. They do not execute mutations that represent user actions.

### 5.2 Feature responsibilities

Each feature owns one user intent and its mutation/form state. Features may import entities and shared code, but never another feature.

- `install-source-plugin`: package picker, multipart upload, upload validation, and install result.
- `manage-source-plugin`: enable, disable, and remove actions.
- `review-source-permissions`: list, approve, and deny requested permissions for a selected version.
- `test-source-plugin`: run plugin test and refresh health/diagnostics.
- `manage-source-credential`: create, update secret, and delete credential profiles.
- `authenticate-source-credential`: login, logout, and test with an optional network profile.
- `manage-source-network-profile`: create, edit, enable/disable, delete, and test profiles.
- `resolve-source-auth-challenge`: OTP, approval, browser-interaction response, and cancellation.
- `inspect-source-url`: reader-operation request state, validation, pagination, and result selection.

### 5.3 Widget responsibilities

Widgets compose multiple entities/features into coherent console surfaces. Cross-feature coordination happens here, for example:

- installing a plugin and refreshing the plugin list;
- testing a plugin and refreshing health plus diagnostics;
- deleting a credential and clearing it from inspector selections;
- responding to a challenge and refreshing the challenge count;
- choosing a credential and network profile for inspector requests.

### 5.4 Page responsibilities

The Sources page owns only:

- section routing and section navigation;
- page title and responsive console shell;
- responsive shell layout;
- top-level error boundary;
- rendering the selected widget.

The page does not directly call Source Reader API functions. Section-specific refresh and actions remain inside the rendered widget.

## 6. Shared Browser Contracts

Browser-facing Source Reader contracts move into `packages/shared` and are exported from the package public barrel. Backend presentation code and web API clients use the same types.

Contracts include:

- plugin descriptor, installation result, diagnostics, health result, and permission record;
- credential metadata, create request, update-secret request, login request, and authentication result;
- network profile metadata, create/update request, and test result;
- authentication challenge metadata and response union;
- identify, metadata, chapter-list, chapter-content, search, and latest-update request/response types;
- Source Reader provenance, warning, and paginated result types.

The browser contract must not expose:

- decrypted secret values;
- encrypted challenge state;
- package filesystem paths;
- internal repository handles;
- runtime process identifiers;
- browser or session objects.

Legacy frontend normalization for `id` versus `pluginId` remains only if the backend still emits both shapes during migration. The final client consumes one canonical shared descriptor.

## 7. Console Sections

## 7.1 Plugins

The Plugins section contains:

- plugin count and health summary;
- searchable plugin list;
- status, trust, active version, domains, capabilities, health, and permission state;
- enable/disable switch using optimistic state only when rollback is safe;
- install action;
- detail navigation.

Plugin detail contains:

- identity and active-version summary;
- capability and domain list;
- current health and last test result;
- diagnostics grouped into compatibility, registration/runtime, and warnings;
- requested permission list with scope details;
- approve/deny controls for the selected installed version;
- test action;
- enable/disable action;
- remove action with confirmation.

### Plugin installation

`/sources/new` opens the installation flow. It accepts exactly one package up to the backend limit of 20 MiB and submits multipart form data with the field name `plugin`.

Client-side checks provide immediate feedback for:

- missing file;
- file over 20 MiB;
- multiple-file attempts;
- unsupported package filename when the repository defines a canonical extension.

Backend verification remains authoritative. Signature, checksum, compatibility, permission, quarantine, and activation failures are displayed using stable Source Reader error codes rather than inferred client rules.

## 7.2 Credentials

The Credentials section lists metadata only:

- name;
- owner scope;
- optional plugin and domain binding;
- authentication strategy;
- enabled state;
- created and updated timestamps.

Supported create strategies:

```text
cookie-import
bearer-token
basic-auth
form-login
custom
```

The form dynamically presents the appropriate secret fields while producing the backend `Record<string, unknown>` secret payload. Strategy adapters live inside the credential feature, not in the page.

Examples:

- cookie import: cookie string or structured cookie JSON according to existing backend strategy expectations;
- bearer token: token field;
- basic auth: username and password;
- form login: username, password, and configuration fields required by the strategy;
- custom: a bounded key/value editor composed from existing `Field`, `Input`, `Button`, and `ListRow` primitives, with explicit duplicate-key and empty-key validation.

After submission:

- secret values are cleared from component state;
- no secret appears in query data;
- edit means replacing the secret, not reading the old value;
- deleting requires confirmation;
- login and test may select a saved network profile;
- logout is available when a credential has an active authentication state or whenever the backend accepts the operation.

The UI never claims a secret is retrievable. Existing secret fields display only an empty replacement form.

## 7.3 Network Profiles

The Network section supports:

```text
direct
http-proxy
https-proxy
socks-proxy
```

Each row shows:

- name and owner scope;
- route type;
- enabled state;
- regions and tags;
- health status;
- last available test information.

Create and edit forms expose route-specific configuration. Route type and owner scope use `SegmentedControl`; credential/profile selection uses responsive `ListRow` pickers inside the existing `Drawer` or `BottomSheet` primitives rather than introducing a private select control. Proxy credentials remain write-only secret fields and are not copied into query data.

Actions:

- create;
- edit metadata/configuration;
- enable or disable through the existing PATCH operation;
- test connectivity;
- delete with confirmation.

Persisted legacy `vpn-gateway` rows may be displayed as unsupported/read-only with a warning and deletion option, but the UI never offers creation or activation of that route type.

## 7.4 Authentication Challenges

The Challenges section displays pending challenges owned by the current actor. It uses bounded polling only while the section is visible or the global pending count is non-zero.

Challenge types:

- `otp`: text/code field and submit;
- `approval`: approve or reject;
- `browser-interaction`: mark completed or not completed after the user performs the required browser action;
- `captcha`: display as requiring external/manual completion unless the backend exposes a supported browser-interaction continuation. The console does not pretend it can submit a response shape the backend route does not accept.

Every challenge view shows:

- plugin ID;
- related credential/network profile when present;
- type and status;
- expiration time and accessible countdown/status text;
- respond or cancel action.

Expired or completed challenges disappear after invalidation. Mutations guard against double submission and render stable error feedback if the challenge expires between display and response.

## 7.5 Inspector

The Inspector provides direct access to the six public reader HTTP operations:

```text
identify
metadata
chapter-list
chapter-content
search
latest-updates
```

### Common request controls

- source URL;
- optional credential profile;
- optional network profile;
- `freshOnly` switch;
- timeout from 1 to 120,000 ms, with a sensible default hidden under advanced controls.

The browser cannot choose a plugin or execution mode. Source Reader remains responsible for plugin resolution and runtime routing.

### Operation-specific controls

- chapter list: cursor and limit up to 500;
- search: query, cursor, and limit up to 100;
- latest updates: cursor and limit according to the backend request contract;
- chapter content: chapter URL;
- identify and metadata: URL only plus common options.

### Results

Result presentation separates:

1. normalized data;
2. source provenance;
3. warnings;
4. optional advanced/raw JSON view of the already-redacted response.

Chapter-list, search, and latest-update results support explicit next-page loading using the returned opaque cursor. The UI does not decode, alter, or persist cursors beyond the active inspector session.

A guided workflow may carry URLs forward:

```text
Identify → Metadata → Chapter list → Chapter content
```

This is convenience state owned by the inspector widget. Each operation remains independently executable.

## 8. Data Fetching and Cache Policy

React Query is the sole server-state mechanism for the console.

Query-key families are hierarchical:

```ts
sourceReader.plugins.all;
sourceReader.plugins.detail(pluginId);
sourceReader.plugins.health(pluginId);
sourceReader.plugins.permissions(pluginId);
sourceReader.credentials.all;
sourceReader.networkProfiles.all;
sourceReader.challenges.all;
sourceReader.challenges.detail(challengeId);
```

Inspector execution results are mutation results or local ephemeral query state, not persisted global queries, because requests may contain user-selected identity and freshness context.

Mutation invalidation rules:

- install/remove/enable/disable → plugin list and affected plugin detail/health;
- approve/deny permissions → permissions, detail, and plugin list;
- plugin test → test result, health, diagnostics, and plugin list;
- credential create/update/delete → credential list and dependent selectors;
- credential login/logout/test → credential list when metadata changes, challenge list, and relevant feedback;
- network create/update/delete/test → network list and dependent selectors;
- challenge respond/cancel → challenge list/detail and global count.

Optimistic updates are allowed only for reversible boolean state such as enable/disable. Installation, deletion, permission decisions, authentication, connectivity tests, and challenge responses wait for server confirmation.

## 9. Error Handling and Feedback

- Page and widget queries use `QueryStateBoundary`, `ErrorBanner`, `LoadingState`, and `EmptyState` where appropriate.
- Mutations use the existing `useAsyncAction`, `useActionFeedback`, action states, and `Toast` patterns.
- Destructive actions use `ConfirmDialog`.
- Forms preserve non-secret user input after recoverable failures but clear secret values when the browser can no longer guarantee safe retention.
- Stable Source Reader error codes are mapped to localized operator messages where known; unknown errors fall back to the shared API error formatter.
- Diagnostics may show redacted technical details but never raw request headers, tokens, cookies, passwords, package filesystem paths, or encrypted state.
- A failed panel does not blank unrelated console sections.

## 10. UI System, Tokens, and Motion

All application TSX imports design primitives from `@/shared/ui`.

Primary primitives:

- layout: `Page`, `PageHeader`, `Section`, `Card`, `Panel`, `ResponsiveSplit`, `Stack`, `Toolbar`, `StickyActionBar`;
- actions: `Button`, `IconButton`;
- forms: `Field`, `Input`, `SearchInput`, `SegmentedControl`, `Switch`, `FilterChip`;
- data display: `DataTable`, `ListRow`, `StatCard`, `Chip`, `Text`;
- feedback: `Badge`, `ErrorBanner`, `InlineNotice`, `LoadingState`, `EmptyState`, `Progress`, `Toast`;
- overlays: `Modal`, `Drawer`, `BottomSheet`, `ConfirmDialog`.

Rules:

- no feature-owned surface primitives;
- no Tailwind font-size or direct line-height utilities;
- no arbitrary color, radius, shadow, opacity, or transition values;
- spacing uses the existing 4/8/12/16/24/32/40/48/64 rhythm;
- icons use the established 20/24/32 px roles;
- touch controls retain existing minimum target behavior;
- large lists use `DataTable`, pagination, or bounded rendering rather than unbounded card lists.

Motion uses only the existing primitives:

```text
--motion-instant
--motion-fast
--motion-normal
--motion-slow
--ease-standard
--ease-emphasized
```

Shared primitives continue to own hover, pressed, loading, overlay, and reduced-motion behavior. Feature code may sequence existing primitives but must not define new animation durations or easing curves.

## 11. Responsive Behavior

### Desktop and tablet

- Console section navigation remains visible near the page header.
- List/detail surfaces use `ResponsiveSplit` where this improves scanning.
- Dense records use `DataTable` or `ListRow`; detail and forms appear in a right panel, drawer, or routed detail page according to existing patterns.

### Mobile

- Section navigation remains scrollable and touch-friendly.
- Lists use compact rows/cards with one primary action and an overflow/details route.
- Create/edit flows use `BottomSheet`, `Drawer`, or routed full-page forms based on content length.
- Destructive confirmations use the existing responsive overlay behavior.
- Inspector results use stacked sections and avoid horizontal overflow; raw JSON is scroll-contained.
- Sticky actions respect safe-area insets through existing shared primitives.

No capability is desktop-only.

## 12. Accessibility

- Every icon-only action has an accessible label.
- Status is communicated by text in addition to color.
- Forms associate labels, help text, and validation errors through `Field`.
- Dialogs and sheets use shared focus trapping and restoration.
- Section navigation and tables remain keyboard accessible.
- Async actions expose disabled/loading state without removing the accessible name.
- Challenge countdowns do not announce every second; status changes use restrained live-region updates.
- Raw diagnostics are selectable text and use semantic headings.
- Reduced-motion preferences are respected automatically through the shared motion system.

## 13. Localization

All user-facing copy is added to both:

```text
apps/web/src/shared/i18n/locales/en.ts
apps/web/src/shared/i18n/locales/vi.ts
```

No feature hardcodes English status labels, error descriptions, field names, confirmation text, or empty-state copy. Dynamic plugin/domain/version values remain untranslated.

## 14. Backend Presentation Adjustments

The backend domain and runtime behavior remain unchanged. Presentation-level work is limited to making browser contracts explicit and consistent:

- export stable management DTOs through `@novel-tool/shared`;
- type controller/use-case responses against those DTOs;
- ensure reader request contracts include the already-supported `timeoutMs` range;
- ensure latest-updates pagination request fields are represented consistently in shared types;
- preserve the multipart field name `plugin` and 20 MiB package limit;
- ensure response redaction before diagnostics reach HTTP clients;
- avoid returning internal paths or secret-bearing configuration.

If an existing response lacks information required by the approved UI, add only a redacted presentation field justified by that screen. Do not expose repository entities wholesale.

## 15. Testing Strategy

### 15.1 Contract tests

- shared Source Reader DTO compile coverage in API and web;
- API-client request method/path/body/form-data assertions for all 33 HTTP routes;
- response normalization and rejection of invalid descriptors;
- no-secret assertions for list/detail responses and query-cache payloads.

### 15.2 Model and mutation tests

- plugin enable/disable optimistic update and rollback;
- correct query invalidation for every mutation group;
- permission decision behavior;
- credential secret clearing after submit/failure paths;
- network route form mapping;
- challenge expiration and double-submit protection;
- inspector cursor pagination and operation-specific validation.

### 15.3 Component and widget tests

- section routing and deep-link restoration;
- plugin install validation and upload state;
- plugin diagnostics/permission states;
- each credential strategy form;
- unsupported legacy VPN profile presentation;
- OTP, approval, browser-interaction, and unsupported CAPTCHA handling;
- inspector guided flow and warning/provenance rendering;
- mobile overlay and desktop split behavior at representative viewports;
- keyboard labels and dialog focus behavior through shared primitives.

### 15.4 Architecture and build gates

The completed work must pass:

```text
npm run check:web-arch
npm run check:web-contracts
npm run check:format
npm run check:types
npm run build
```

Relevant Source Reader API regression/integration suites and new web tests must pass with zero failures.

E2E covers at minimum:

1. install a fixture plugin and inspect its state;
2. approve permissions and enable it;
3. create/test a network profile;
4. create/test a credential;
5. respond to a challenge fixture;
6. run identify → metadata → chapter list → chapter content in Inspector.

When enterprise browser policy blocks localhost, the E2E limitation must be reported explicitly rather than represented as an application pass.

## 16. Migration Strategy

1. Introduce shared browser contracts without changing existing runtime behavior.
2. Split the current `manage-source-plugins` API into entity API boundaries and focused features.
3. Preserve current `/sources` behavior while adding route-addressable section shell.
4. Replace the current page-owned `useSourcesPage` orchestration with widget/feature models.
5. Add Plugins detail and installation flows.
6. Add Credentials, Network, and Challenges sections.
7. Add Inspector last because it consumes credential/network entities and reader contracts.
8. Remove obsolete page-owned cards/hooks and the unsupported Add Source empty state only after replacement tests pass.

No parallel legacy console remains after migration.

## 17. Acceptance Criteria

The design is complete when:

1. Every Source Reader HTTP route has a typed browser client and an intentional UI or explicit backend-only classification.
2. All user-meaningful management capabilities are available from `/sources`.
3. All six public reader operations are executable in Inspector.
4. Secrets are write-only in the UI and absent from query caches, persistence, diagnostics, and feedback.
5. No page imports Source Reader API clients directly.
6. No feature imports another feature.
7. No new feature-owned design-system primitive, arbitrary visual token, or custom animation duration is introduced.
8. Desktop and mobile support the same capability set.
9. English and Vietnamese copy are complete.
10. Architecture, contract, type, format, test, and production-build gates pass.
