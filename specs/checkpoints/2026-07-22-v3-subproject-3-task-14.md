# Novel Tool V3 Subproject 3 Task 14 Checkpoint

Date: 2026-07-22

## Status

- Subproject 1, Contract Freeze and Backend Foundation: complete.
- Subproject 2, Backend Capability Migration: complete.
- Subproject 3, Tasks 1 through 13: complete.
- Subproject 3, Task 14, Port Novel Detail and Reader Screens: complete.
- Task 13 checkpoint commit: `00d65ad` (`docs: checkpoint v3 subproject 3 task 13`).
- Task 14 implementation commit: `a20ca49` (`feat: port v3 novel and reader screens`).
- Working branch: `feat/v3-web-next-novel-reader-pages`.
- No Task 15 Sources, Settings, dual-preview Playwright configuration, or frontend completion-gate work has been started.

## Completed Scope

- Added the real `/library/:novelId` Novel Detail page.
- Added the real `/library/:novelId/read/:chapterIndex` immersive Reader page.
- Replaced the Task 12 foundation loaders for Novel Detail and Reader with their real lazy page modules.
- Added a management sheet that composes update, crawl, automatic-update, and export feature public APIs.
- Preserved chapter status/error display, task progress, reading progress, bookmarks, chapter navigation, delete confirmation, and last-reading-position return.
- Preserved detail-to-reader route state and the background scroll restoration key when opening and closing the reader.
- Added a React reader composition over the public `useReaderController` adapter without placing IndexedDB, localStorage, session construction, or window trimming inside the page.
- Added bounded rendering with `windowLimit: 5` and an E2E assertion that the rendered chapter count never exceeds five.
- Added previous/next navigation, keyboard/swipe navigation, adjacent loading, retry, cancellation, scroll anchoring, position persistence, history, bookmarks, read-state tracking, and chapter-list selection.
- Added screen wake lock with visibility-aware reacquisition and best-effort release.
- Added auto-hiding reader chrome, offline/loading/error states, preferences sheet, progress UI, and bottom navigation controls.
- Added reusable Reader Toolbar, Reader Progress, and Reader Bottom Bar widgets with public indexes.
- Added EN/VI Novel Detail and Reader catalog entries.
- Added Task 14 regression coverage for delegation, bounded rendering, route-state preservation, management composition, reader lifecycle, continuity, public imports, and real route loaders.
- Added the Task 14 Playwright reader-parity specification. Its dual-preview config remains intentionally deferred to Task 15 as required by the plan.

## Locked Decisions

- Pages convert route parameters and wire callbacks; reader engine/session, browser persistence, and continuity storage remain in the reader feature and engine layers.
- Novel Detail composes public entity and feature APIs only. It owns no HTTP client, TanStack mutation, query key, or write workflow.
- Reader rendering is capped at five chapters and remains centered around the active chapter through `reader-engine`.
- Reader route transitions preserve the original detail route and background scroll key.
- The reader session is canceled only when the mounted reader lifecycle ends or the novel/session identity changes, not whenever reading position changes.
- Reading anchors are persisted through the public continuity API; the page does not directly access IndexedDB or localStorage.
- Wake lock is optional and failures are intentionally non-fatal.
- Task 15 remains untouched, including Sources, Settings, `playwright.web-next.config.ts`, dual-preview web servers, next-frontend contract CLI, semantic parity specs, and the final frontend verification command.

## RED -> GREEN Evidence

The first valid Task 14 regression run failed all nine tests because the Novel Detail page, Chapter Reader page, Reader Toolbar, Reader Progress, Reader Bottom Bar, and real route loaders did not exist.

The initial GREEN implementation passed the nine focused tests. The Web Next compiler then exposed a real component-tone mismatch, which was corrected without weakening types. Self-review identified two lifecycle issues before the final gate: the reader-return transition needed to preserve the original background scroll key, and a cleanup effect could cancel the reader session whenever reading position changed. Both were corrected at the lifecycle boundary.

A previous Task 6 ownership regression then caught one stale reference to the pre-refactor lower-camel mutation variable names in the Novel Detail aggregate error expression. The expression was corrected to use the renamed feature mutation objects, returning the old ownership test to GREEN.

The Playwright bounded-render assertion was also refined to verify the actual invariant—at least one chapter is rendered and no more than five are present—without assuming that the engine must synchronously fill all five slots on the first frame.

## Fresh Verification

The following checks completed after the final source changes:

```powershell
node --loader /tmp/task14-ts-loader.mjs --test <Task 1-14 Web Next regression files and reader continuity/control files>
node --loader /tmp/task14-ts-loader.mjs --test tests/regression/source-reader-web-console-contract.test.ts tests/regression/source-reader-web-contract.test.ts
node scripts/check-web-next-architecture.mjs
node scripts/check-reader-engine-architecture.mjs
node node_modules/typescript/bin/tsc -p apps/web-next/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc -p packages/reader-engine/tsconfig.json --noEmit
node --loader /tmp/task14-ts-loader.mjs --test packages/reader-engine/tests/*.test.ts
node scripts/prepare-packages.mjs
node scripts/check-web-contracts.mjs
node scripts/check-lockfile-portability.mjs
node scripts/check-docs.mjs
prettier --check <Task 14 changed TypeScript paths>
git diff --check
```

Recorded results:

- Selected Task 1-14 Web Next regressions and reader continuity/control tests: 93 pass, 0 fail.
- Task 14 focused tests: 9 pass, 0 fail.
- Source Reader browser security/contract tests: 5 pass, 0 fail.
- Reader-engine focused tests: 8 pass, 0 fail.
- Real `apps/web-next` FSD architecture check: pass.
- Reader-engine purity check: pass.
- `web-next` TypeScript check: pass.
- Reader-engine TypeScript check: pass.
- Package preparation and reader-engine production build: pass.
- Frozen frontend contract check: pass.
- Lockfile portability: pass.
- Documentation, targeted Prettier, and whitespace checks: pass.
- The Task 14 Playwright spec transpiles with zero TypeScript syntax diagnostics.

The legacy current-app command below remains at eight passes and one pre-existing failure:

```powershell
node --test apps/web/tests/network-efficiency-phase2.test.mjs apps/web/tests/task-refresh-stability.test.mjs
```

The failing legacy assertion slices `apps/web/src/pages/Settings.tsx` between the markers `const plugins` and `const runScheduler`. The second marker no longer exists, so the test inspects an empty string before evaluating the Source Reader polling assertion. Task 14 does not modify the legacy Settings page. The other eight legacy assertions pass.

The Task 14 browser spec could not be executed because `playwright.web-next.config.ts` and the dual current/next preview-server setup are explicitly created by Task 15. The specification is present and syntax-valid, but claiming a browser pass before Task 15 would be incorrect.

The Web Next production build completed its TypeScript stage. Vite then failed before source bundling because the available dependency tree was installed on Windows and lacks `@rolldown/binding-linux-x64-gnu`. This is an execution-environment optional native dependency limitation, not a Task 14 source or type failure. Rerun the production frontend build after a normal Linux `npm ci` with registry access.

The full backend regression and integration suites were not rerun for this isolated frontend-screen task.

## Resume Point

Continue with:

- Design: `specs/2026-07-21-novel-tool-v3-clean-rewrite-design.md`
- Plan: `specs/plans/2026-07-21-v3-subproject-3-frontend-foundation-capability-migration.md`
- Next task: Task 15, Port Sources and Settings, Prove Browser Parity, and Complete Frontend Verification.

Do not begin Subproject 4 before Task 15 has its own RED -> GREEN -> REFACTOR cycle, frontend completion gate, checkpoint, and explicit verification record.
