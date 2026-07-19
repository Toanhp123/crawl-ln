# Phase 4 Implementation Plan — Settings, Polish, Accessibility, Performance, and Release

> **Execution rule:** Phase 4 closes real gaps only. Do not add settings or metrics without functional backing.

**Goal:** Complete product configuration, unify all edge states, audit every viewport and accessibility path, optimize measured bottlenecks, and produce the final portable `2.1.0` release.

---

## Task 4.1 — Audit settings capabilities before adding UI

**Files**
- Create: `docs/frontend/SETTINGS_CAPABILITY_MATRIX.md`
- Inspect API routes, environment configuration, local storage, and current settings model.

**Matrix columns**
- setting name
- current backend/frontend capability
- persistence location
- requires API change
- safe for Phase 4
- test method

**Steps**
- [ ] Inventory Appearance, Reader, Crawler, Download, Storage, Language, and About.
- [ ] Mark unsupported controls as out of scope rather than creating inert UI.
- [ ] Define destructive operations and confirmation requirements.
- [ ] Review the matrix before implementation.
- [ ] Commit capability documentation.

**Acceptance**
Every displayed setting maps to real behavior.

---

## Task 4.2 — Recompose Settings navigation and groups

**Files**
- Modify: `apps/web/src/pages/settings/ui/SettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/model/useSettingsPage.tsx`
- Modify:
  - `AppearanceSettings.tsx`
  - `LanguageSettings.tsx`
  - `ReaderSettings.tsx`
  - `AboutSettings.tsx`
- Conditionally create:
  - `CrawlerSettings.tsx`
  - `DownloadSettings.tsx`
  - `StorageSettings.tsx`
- Modify `SettingRow.tsx` and `SettingsGroup.tsx` only for shared settings-page composition, not global UI.

**Behavior**
- Groups have icons, title, description, and concise rows.
- Long controls open sheets rather than expanding the page excessively.
- Dangerous actions are visually separated.
- About displays actual build version.
- Reader settings remain backed by Phase 3 preference model.
- Settings persist through refresh.

**Steps**
- [ ] Write failing regression tests for capability-backed sections.
- [ ] Recompose page with existing sections.
- [ ] Add only approved capability sections.
- [ ] Add translated labels and descriptions.
- [ ] Add E2E for persistence and destructive confirmation.
- [ ] Run tests and build.
- [ ] Commit Settings completion.

---

## Task 4.3 — Product-wide state audit

**Files**
- Create: `docs/frontend/UI_STATE_MATRIX.md`
- Audit all files under:
  - `pages`
  - `widgets`
  - `features`
  - data-bearing `entities`

**State matrix**
- initial loading
- background refresh
- empty
- filtered empty
- partial data
- recoverable error
- unrecoverable error
- offline API
- success feedback
- unsupported capability

**Steps**
- [ ] Record current handling for every screen.
- [ ] Add failing tests for missing required states.
- [ ] Replace raw spinners and raw error strings with Phase 1 primitives.
- [ ] Preserve successful data during refresh.
- [ ] Add retry actions only when safe.
- [ ] Verify copy in both languages.
- [ ] Commit state remediation in small screen-specific commits.

**Acceptance**
No user-facing data request ends in an unlabeled spinner, blank page, or raw exception.

---

## Task 4.4 — Responsive and keyboard-aware audit

**Files**
- Create: `tests/e2e/responsive-layout.spec.ts`
- Modify layout components only when a reusable issue exists.
- Page-local changes remain in the owning page/widget.

**Viewports**
- 320 × 640
- 360 × 800
- 390 × 844
- tablet portrait
- tablet landscape
- desktop

**Checks**
- no horizontal overflow
- bottom navigation safe-area
- sticky action clearance
- virtual keyboard does not hide submit
- bottom sheets fit small height
- large font setting
- landscape Reader width
- long Vietnamese labels
- task badge `99+`

**Steps**
- [ ] Add viewport loop E2E tests.
- [ ] Record every failing screen.
- [ ] Fix shared root causes first.
- [ ] Fix page-specific overflow locally.
- [ ] Re-run after each group.
- [ ] Commit responsive fixes.

---

## Task 4.5 — Automated and manual accessibility audit

**Files**
- Create: `tests/e2e/accessibility.spec.ts`
- Add `@axe-core/playwright` to root dev dependencies.
- Modify `.github/workflows/ci.yml` to run accessibility E2E.

**Automated pages**
- Crawl
- Library
- Tasks
- Settings
- Reader overview
- immersive Reader
- representative bottom sheet and dialog

**Manual checks**
- keyboard-only navigation
- focus order
- focus restoration
- screen-reader landmarks
- icon labels
- progress announcements
- 200% text zoom
- contrast
- reduced motion
- no color-only status

**Steps**
- [ ] Install dependency and confirm public registry lockfile URLs.
- [ ] Add failing axe tests.
- [ ] Fix critical and serious violations.
- [ ] Document any accepted minor issue with rationale.
- [ ] Run full accessibility suite in CI.
- [ ] Commit audit fixes.

**Acceptance**
No critical or serious automated violation and no manual blocker.

---

## Task 4.6 — Measure before performance changes

**Files**
- Create: `docs/frontend/PERFORMANCE_BASELINE.md`
- Add a build analysis command only if it does not affect production behavior.

**Measurements**
- JS and CSS bundle sizes
- route chunks
- Library render with representative dataset
- chapter list with large dataset
- Reader preference update rerenders
- Tasks background refresh rerenders
- image layout shift
- initial loading on mobile emulation

**Steps**
- [ ] Capture baseline measurements.
- [ ] Set explicit acceptable thresholds.
- [ ] Identify measured bottlenecks.
- [ ] Reject speculative optimization work.
- [ ] Commit baseline document.

---

## Task 4.7 — Apply measured performance fixes

**Potential files**
- `apps/web/src/app/router/AppRouter.tsx`
- Library and chapter-list widgets
- query selectors
- image components
- package scripts

**Allowed fixes**
- route-level lazy loading
- fixed image dimensions and lazy decoding
- stable query `select` functions
- memoized expensive pure derivations
- incremental/virtualized long lists
- duplicate shared-build removal from workspace dev scripts

**Termux script rule**
Root performs the initial Shared build. Workspace `dev` scripts must not duplicate it, but Web must still call:

```bash
node ./node_modules/vite/bin/vite.js --host 0.0.0.0
```

**Steps**
- [ ] Write a regression or measurable benchmark for each selected bottleneck.
- [ ] Apply one optimization.
- [ ] Compare against baseline.
- [ ] Keep only changes with demonstrated benefit and no behavior regression.
- [ ] Run full suite.
- [ ] Commit each optimization separately.

---

## Task 4.8 — Internationalization and product-copy audit

**Files**
- `apps/web/src/shared/i18n/locales/en.ts`
- `apps/web/src/shared/i18n/locales/vi.ts`
- Create: `tests/regression/i18n-completeness.test.ts`

**Checks**
- identical key sets
- no visible fallback keys
- consistent crawler/task terminology
- translated accessible labels
- concise mobile labels
- correct punctuation and capitalization
- long Vietnamese labels fit

**Steps**
- [ ] Add key-parity regression test.
- [ ] Scan visible strings outside locale files.
- [ ] Move product strings into i18n.
- [ ] Review both locale files screen by screen.
- [ ] Run E2E in both languages.
- [ ] Commit copy audit.

---

## Task 4.9 — Full product E2E journeys

**Files**
- Create: `tests/e2e/product-journeys.spec.ts`
- Update Playwright fixtures and route mocks.

**Journeys**
1. Empty app → Crawl → analyze → crawl → task activity → Library.
2. Library search → novel → chapter → immersive Reader → preference change → next chapter.
3. Failed task → filter → details → retry when supported.
4. Settings theme/language → reload → persisted values.
5. API unreachable → error → retry → recovery.
6. Reader reload → reading-position restoration.
7. All primary routes at 320 px without overflow.

**Steps**
- [ ] Build deterministic API mocks or isolated test database fixtures.
- [ ] Implement each journey separately.
- [ ] Verify failure before completing missing behavior.
- [ ] Run Chromium in CI.
- [ ] Fix flakes; do not hide them with broad retries.
- [ ] Commit stable journeys.

---

## Task 4.10 — Documentation and release packaging

**Files**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/frontend/FSD.md`
- Create: `docs/frontend/DESIGN_SYSTEM_V2.md`
- Create: `docs/frontend/MOBILE_UX_ACCEPTANCE.md`
- Update `.github/workflows/ci.yml`
- Update all package versions to `2.1.0`

**Documentation**
- design-system layers
- component usage
- shell and route rules
- reader preference storage
- mobile test matrix
- Termux installation and development
- release verification commands

**Clean-install verification**
```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules
npm cache verify
npm ci
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e
npm audit
```

**Archive exclusions**
- `node_modules`
- `dist`
- Playwright output
- coverage
- database/storage
- logs
- cache
- editor files
- internal registry URLs

**Steps**
- [ ] Update version and changelog only after all tests pass.
- [ ] Build clean archive.
- [ ] Extract archive into a fresh directory.
- [ ] Run `npm ci` from the public registry.
- [ ] Run release gate from extracted archive.
- [ ] Verify Termux startup commands.
- [ ] Tag `v2.1.0` only after CI and clean archive verification pass.

## Phase 4 exit criteria

- Settings exposes only real capabilities.
- Every data state is designed.
- Responsive matrix passes.
- No critical/serious accessibility issue remains.
- Performance regressions are measured and resolved.
- English/Vietnamese key parity passes.
- Full E2E journeys pass in CI.
- Audit has no high or critical vulnerability.
- Portable archive installs and runs on Termux.
