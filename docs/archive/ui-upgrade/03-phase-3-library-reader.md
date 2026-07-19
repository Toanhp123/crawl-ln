# Phase 3 Implementation Plan — Library and Reader

> **Execution rule:** Preserve content and reading behavior first. Decorative reader effects cannot block navigation, text selection, accessibility, or restoration.

**Goal:** Create a content-first library and immersive reader with reliable chapter navigation, persistent preferences, and local reading-position restoration.

**Architecture:** Library uses pure view-model selectors and feature-owned filtering. Reader uses a dedicated shell, a unified preference model, and isolated toolbar/chapter-navigation widgets. Local reading progress is stored behind a versioned adapter.

---

## Task 3.1 — Freeze Library and Reader contracts

**Files**
- Create: `tests/regression/library-mobile-ui.test.ts`
- Create: `tests/regression/reader-mobile-ui.test.ts`
- Create: `tests/e2e/library-reader.spec.ts`

**Contracts**
- Library distinguishes no novels from no search results.
- Reader route hides persistent app navigation.
- Visible previous/next controls exist.
- Gesture actions are optional.
- Preferences have one source of truth.
- Last position storage is versioned.
- Reader content never uses hard-coded text/background colors.

**Steps**
- [ ] Write failing tests for required modules and contracts.
- [ ] Add route-mocked E2E covering open library, open novel, choose chapter, and enter Reader.
- [ ] Confirm intended failures.
- [ ] Commit red tests.

---

## Task 3.2 — Build Library view model

**Files**
- Create: `apps/web/src/pages/library/model/libraryView.ts`
- Modify: `apps/web/src/pages/library/model/useLibraryPage.ts`
- Create: `apps/web/src/shared/lib/formatRelativeTime.ts`

**Interfaces**
```ts
export interface LibraryItemView {
  id: string;
  title: string;
  coverUrl?: string;
  chapterCount: number;
  sourceLabel?: string;
  lastUpdatedLabel?: string;
  lastReadChapter?: number;
  progress?: number;
}
```

**Rules**
- Optional fields remain optional.
- Progress is shown only when supported.
- Search normalization handles Vietnamese text consistently.
- Sort is stable.

**Steps**
- [ ] Write tests for search, stable sorting, optional metadata, and progress clamping.
- [ ] Implement pure helpers.
- [ ] Update hook to expose display items and state precedence.
- [ ] Run regression and type-check.
- [ ] Commit view model.

---

## Task 3.3 — Rebuild novel cards and Library list

**Files**
- Modify: `apps/web/src/entities/novel/ui/NovelCard.tsx`
- Modify: `apps/web/src/widgets/mobile-library/ui/MobileLibrary.tsx`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Create: `apps/web/src/entities/novel/ui/NovelCover.tsx`
- Create: `apps/web/src/entities/novel/ui/NovelProgress.tsx`

**Behavior**
- Fixed cover aspect ratio prevents layout shift.
- Missing cover uses a semantic fallback.
- Title supports two to three lines without clipping.
- Metadata is subdued but readable.
- Entire primary card area opens novel details.
- Secondary actions use a visible menu; long press is not required.
- Images use `loading="lazy"` and decoding hints.

**Steps**
- [ ] Add failing E2E expectations for card structure and no overflow.
- [ ] Implement cover and progress primitives.
- [ ] Rebuild NovelCard.
- [ ] Migrate MobileLibrary.
- [ ] Verify 320 px, large text, and missing-cover layouts.
- [ ] Run tests and build.
- [ ] Commit Library cards.

---

## Task 3.4 — Implement Library search, sort, and filter sheets

**Files**
- Create: `apps/web/src/features/filter-library/model/useLibraryFilters.ts`
- Create: `apps/web/src/features/filter-library/ui/LibraryFilterSheet.tsx`
- Create: `apps/web/src/features/sort-library/ui/LibrarySortSheet.tsx`
- Modify: `apps/web/src/pages/library/ui/LibraryPage.tsx`
- Modify translations

**Behavior**
- Search input is immediately available.
- Sort opens a single-choice sheet.
- Filter chips summarize active filters.
- Clear-all is available only when filters are active.
- Empty library routes users to Crawl.
- Empty search offers clear query action.

**Steps**
- [ ] Write failing filter/sort tests.
- [ ] Implement model and sheets.
- [ ] Migrate page controls.
- [ ] Add E2E for search, sort, filter, clear, and empty state.
- [ ] Verify focus restoration and keyboard operation.
- [ ] Run focused suite and build.
- [ ] Commit discovery controls.

---

## Task 3.5 — Rebuild novel overview and chapter selection

**Files**
- Create: `apps/web/src/widgets/novel-overview/ui/NovelOverview.tsx`
- Modify: `apps/web/src/entities/chapter/ui/ChapterList.tsx`
- Create: `apps/web/src/features/select-chapter/ui/ChapterListSheet.tsx`
- Modify: `apps/web/src/pages/reader/model/useReaderPage.ts`
- Modify: `apps/web/src/pages/reader/ui/ReaderPage.tsx`

**Behavior**
- Novel metadata and chapter selection are usable before immersive reading.
- Current/last-read chapter is marked with text and icon.
- Chapter list search is available when chapter count exceeds a defined threshold.
- For large lists, measure rendering; add incremental rendering or windowing only when needed.
- Opening a chapter updates route predictably.
- Selected chapter scrolls into view when sheet opens.

**Steps**
- [ ] Add failing chapter selection tests.
- [ ] Implement overview widget.
- [ ] Normalize chapter row interface.
- [ ] Implement sheet with searchable list threshold.
- [ ] Add performance fixture with a large chapter count.
- [ ] Choose incremental or virtualized rendering based on measurement.
- [ ] Run tests, build, and manual mobile review.
- [ ] Commit chapter selection.

---

## Task 3.6 — Create unified reader preference model

**Files**
- Create: `apps/web/src/features/reader-preferences/model/readerPreferences.ts`
- Create: `apps/web/src/features/reader-preferences/model/useReaderPreferences.ts`
- Create: `apps/web/src/features/reader-preferences/ui/ReaderPreferencesSheet.tsx`
- Modify: `apps/web/src/pages/settings/model/useSettingsPage.tsx`
- Modify: `apps/web/src/pages/settings/ui/sections/ReaderSettings.tsx`
- Modify: `apps/web/src/shared/theme/component-tokens.css`

**Preference schema**
```ts
interface ReaderPreferences {
  theme: "light" | "sepia" | "dark" | "system";
  fontFamily: "serif" | "sans";
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  pageMargin: number;
  textAlign: "left" | "justify";
  indent: boolean;
  hyphenation: boolean;
}
```

**Rules**
- Existing stored preference keys are migrated.
- Values are clamped and validated.
- Settings page and Reader use the same hook/adapter.
- Preview changes immediately.
- Persistence failure does not break reading.

**Steps**
- [ ] Write schema/default/migration/clamp tests.
- [ ] Confirm tests fail against missing model.
- [ ] Implement storage adapter and hook.
- [ ] Migrate Settings.
- [ ] Implement Reader sheet.
- [ ] Add E2E for update, reload, and persistence.
- [ ] Run all tests.
- [ ] Commit preferences.

---

## Task 3.7 — Implement immersive Reader shell and toolbar

**Files**
- Modify: `apps/web/src/app/layouts/ReaderShell.tsx`
- Modify: `apps/web/src/entities/chapter/ui/ChapterReader.tsx`
- Modify: `apps/web/src/features/read-chapter/model/useChapterReader.ts`
- Create: `apps/web/src/widgets/reader-toolbar/ui/ReaderToolbar.tsx`
- Create: `apps/web/src/widgets/reader-progress/ui/ReaderProgress.tsx`
- Create: `apps/web/src/features/navigate-chapter/ui/ChapterNavigation.tsx`

**Behavior**
- Reader toolbar can be shown/hidden.
- A tap zone may toggle toolbar, but toolbar also has visible activation support.
- Back, chapter list, preferences, previous, and next are explicit.
- Previous/next disabled states are understandable.
- Progress is chapter-relative and announced accessibly.
- Text selection is not blocked by tap handling.
- Browser back semantics remain correct.
- Reduced motion disables sliding transforms.

**Steps**
- [ ] Add failing E2E for hidden bottom navigation and visible chapter controls.
- [ ] Implement toolbar state in Reader shell.
- [ ] Implement chapter navigation feature.
- [ ] Apply preference tokens to content.
- [ ] Add safe-area top and bottom behavior.
- [ ] Test text selection and keyboard.
- [ ] Run E2E and build.
- [ ] Commit immersive Reader.

---

## Task 3.8 — Add versioned local reading-position storage

**Files**
- Create: `apps/web/src/features/read-chapter/model/readingPositionStorage.ts`
- Modify: `apps/web/src/features/read-chapter/model/useChapterReader.ts`
- Create: `tests/regression/reading-position.test.ts`

**Schema**
```ts
interface StoredReadingPositionV1 {
  version: 1;
  novelId: string;
  chapterIndex: number;
  scrollRatio: number;
  updatedAt: string;
}
```

**Behavior**
- Save is throttled.
- Ratio is clamped between 0 and 1.
- Restore occurs after chapter content layout is stable.
- Position older than a defined retention window may be discarded.
- A changed chapter content height uses ratio rather than raw pixels.
- User can return to top.
- Storage failure is nonfatal.

**Steps**
- [ ] Write serialization, validation, corruption, clamp, and migration tests.
- [ ] Implement adapter.
- [ ] Integrate save and restore.
- [ ] Add E2E reload restoration.
- [ ] Verify navigation to a new chapter does not restore the old chapter position.
- [ ] Run tests and commit.

**Acceptance**
Reading restoration is deterministic and does not require backend changes.

---

## Task 3.9 — Optional wake lock capability

**Files**
- Create: `apps/web/src/features/keep-awake/model/useWakeLock.ts`
- Integrate into Reader preferences only if supported.

**Rules**
- User must explicitly enable it.
- Unsupported browsers display explanatory disabled state.
- Lock is reacquired after visibility change only while enabled.
- Failure never blocks reading.

**Steps**
- [ ] Write capability and lifecycle tests using a thin adapter.
- [ ] Implement hook.
- [ ] Integrate accessible setting.
- [ ] Run tests and commit.

---

## Task 3.10 — Phase 3 release verification

**E2E matrix**
- no novels
- populated library
- no search results
- missing cover
- large chapter list
- first/middle/last chapter
- preferences persistence
- reading-position restoration
- 320/360/390 px
- light/sepia/dark reader
- English/Vietnamese
- reduced motion

**Commands**
```bash
npm run check:lockfile
npm run check
npm run test:regression
npm run test:integration
npm run build
npm run test:e2e
npm audit
```

**Completion**
- [ ] Update changelog.
- [ ] Version `2.1.0-rc.1`.
- [ ] Review bundle size and long-list rendering.
- [ ] Confirm no backend schema change.
- [ ] Confirm CI passes.

## Phase 3 exit criteria

Library and Reader are fully usable by touch, keyboard, and visible controls; preferences and local position persist; no gesture is mandatory.
