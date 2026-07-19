# UI Platform v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the mobile design system and product UI with accent/density settings, Reader Pro, localized product pages, accessibility, and regression audits.

**Architecture:** Runtime appearance and reader preferences are provided by focused React contexts backed by localStorage and HTML data attributes. Pages consume shared primitives and typed i18n helpers; unsupported backend actions are excluded. Regression tests audit source-level contracts and pure helper behavior.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Radix UI, React Router, TanStack Query, Lucide, Node test runner.

## Global Constraints

- Default theme is Dark Gray, accent Indigo, density Compact.
- Theme choices are System, Dark, Light.
- Accent choices are Indigo, Blue, Emerald, Amber.
- Language choices are English and Vietnamese.
- Preserve current crawler, dedupe, and routing behavior.
- Do not add fake backend controls.

---

### Task 1: Runtime design-system preferences
**Files:** Modify theme CSS, `ThemeProvider.tsx`, `index.html`; create `PreferencesProvider.tsx`; test bootstrap/data attributes.
- [ ] Add failing regression tests for accent, density, reduced motion and bootstrap attributes.
- [ ] Implement typed appearance and reader preference persistence.
- [ ] Add semantic accent, density, motion, focus and state tokens.
- [ ] Run regression tests and frontend type-check.

### Task 2: Shared mobile primitives
**Files:** Create `SegmentedControl.tsx`, `BottomSheet.tsx`; update Toast, Dialog, exports.
- [ ] Add failing source audit for required accessible primitives.
- [ ] Implement keyboard/ARIA/reduced-motion behavior.
- [ ] Update export flow to use BottomSheet.
- [ ] Run tests and type-check.

### Task 3: Reader Pro
**Files:** Modify Settings, ChapterReader, ReaderPage; create reader helpers/hooks.
- [ ] Add failing tests for paragraph formatting, progress, reading time, generic title translation and reader preference attributes.
- [ ] Implement font family/weight/margins/alignment/indent/hyphen/drop-cap/keep-awake.
- [ ] Implement auto-hide chrome, center-tap toggle, keyboard and swipe chapter navigation.
- [ ] Run tests and build.

### Task 4: Product-page polish
**Files:** Modify Library, Crawl, Tasks and related widgets/i18n.
- [ ] Add failing audits for localized labels and tokenized sizes.
- [ ] Add library sort/status filtering and native rows.
- [ ] Simplify Crawl and localize compact help disclosure.
- [ ] Improve Tasks number/progress formatting without fake actions.
- [ ] Run tests and build.

### Task 5: Quality platform and final verification
**Files:** Modify i18n provider/locales, regression tests and docs.
- [ ] Add typed plural/number/date/relative-time helpers.
- [ ] Add dictionary parity, palette, CSS variable, bootstrap, accessibility and reader regression audits.
- [ ] Run regression tests, crawler check, shared build, frontend check and production build.
- [ ] Remove dependencies/build artifacts and create one verified ZIP.
